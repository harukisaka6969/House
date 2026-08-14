import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, ApiError, errorResponse } from "@/lib/apiAuth";
import { listSavingsActions, createSavingsAction, createDiscountSavingsAction, getSavingsActionById } from "@/lib/savingsActions";
import { estimateSavingsAction } from "@/lib/anthropic";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";
import { todayStrJST, isValidDateStr } from "@/lib/date";

export async function GET(req: Request) {
  try {
    await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const owner = searchParams.get("owner") || undefined;
    const [allRows, profiles] = await Promise.all([listSavingsActions(), getAllProfiles()]);
    const rows = owner ? allRows.filter((r) => r.owner === owner) : allRows;
    const nameOf = makeNameLookup(profiles);
    const actions = rows.map((r) => ({ ...r, owner_name: nameOf(r.owner) }));
    const totalSaving = rows.reduce((s, r) => s + r.estimated_saving, 0);
    return NextResponse.json({ actions, totalSaving });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.union([
  z.object({
    description: z.string().min(1).max(500),
    date: z.string().refine(isValidDateStr).optional(),
  }),
  z.object({
    duplicate_of: z.string().uuid(),
    date: z.string().refine(isValidDateStr).optional(),
  }),
  z.object({
    item: z.string().min(1).max(200),
    discount_percent: z.number().min(1).max(99),
    price_paid: z.number().positive(),
    date: z.string().refine(isValidDateStr).optional(),
  }),
]);

/** 新規: 節約になった行動の説明文をAIで見積もってカード化する。
 * duplicate_of指定時: 既存カードと同じ内容（タイトル・金額・根拠・キーワード）で、
 * 別の日（既定は今日）の行動として複製する — 同じ行動を後日も繰り返した場合用。AIは呼ばない。
 * item/discount_percent/price_paid指定時: 「○○を○%オフで○○円で買った」という割引購入。節約額は
 * AIに推測させず、支払額と割引率からサーバー側で確定計算する（絵文字の選定だけAIに任せる）。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const body = bodySchema.parse(await req.json());
    const profiles = await getAllProfiles();
    const nameOf = makeNameLookup(profiles);

    if ("item" in body) {
      const row = await createDiscountSavingsAction(session.profile_id, {
        item: body.item,
        discountPercent: body.discount_percent,
        pricePaid: body.price_paid,
        date: body.date ?? todayStrJST(),
      });
      return NextResponse.json({ action: { ...row, owner_name: nameOf(row.owner) } });
    }

    if ("duplicate_of" in body) {
      const original = await getSavingsActionById(body.duplicate_of);
      if (!original) throw new ApiError(404, "元のカードが見つかりません");
      const row = await createSavingsAction({
        owner: session.profile_id,
        date: body.date ?? todayStrJST(),
        description: original.description,
        title: original.title,
        estimated_saving: original.estimated_saving,
        reasoning: original.reasoning,
        keywords: original.keywords,
        emoji: original.emoji,
      });
      return NextResponse.json({ action: { ...row, owner_name: nameOf(row.owner) } });
    }

    const estimate = await estimateSavingsAction(body.description, todayStrJST());
    const row = await createSavingsAction({
      owner: session.profile_id,
      date: body.date ?? todayStrJST(),
      description: body.description,
      title: estimate.title,
      estimated_saving: estimate.estimated_saving,
      reasoning: estimate.reasoning,
      keywords: estimate.keywords,
      emoji: estimate.emoji,
    });
    return NextResponse.json({ action: { ...row, owner_name: nameOf(row.owner) } });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
