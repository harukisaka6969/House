import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, ApiError, errorResponse } from "@/lib/apiAuth";
import {
  listSavingsActions,
  listSavingsHistory,
  createSavingsAction,
  createDiscountSavingsAction,
  logSavingsActionOccurrence,
} from "@/lib/savingsActions";
import { estimateSavingsAction } from "@/lib/anthropic";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";
import { todayStrJST, businessDateJST, isValidDateStr } from "@/lib/date";

export async function GET(req: Request) {
  try {
    await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const owner = searchParams.get("owner") || undefined;
    const [allCards, allHistory, profiles] = await Promise.all([listSavingsActions(), listSavingsHistory(), getAllProfiles()]);
    const cards = owner ? allCards.filter((r) => r.owner === owner) : allCards;
    const historyRows = owner ? allHistory.filter((r) => r.owner === owner) : allHistory;
    const nameOf = makeNameLookup(profiles);
    const actions = cards.map((r) => ({ ...r, owner_name: nameOf(r.owner) }));
    const history = historyRows.map((r) => ({ ...r, owner_name: nameOf(r.owner) }));
    const totalSaving = cards.reduce((s, r) => s + r.estimated_saving, 0);
    return NextResponse.json({ actions, history, totalSaving });
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
    price_paid: z.number().min(0),
    date: z.string().refine(isValidDateStr).optional(),
  }),
  z.object({
    item: z.string().min(1).max(200),
    original_price: z.number().positive(),
    price_paid: z.number().min(0),
    date: z.string().refine(isValidDateStr).optional(),
  }),
]);

/** 新規: 節約になった行動の説明文をAIで見積もって新規カード化する。既存カードと同じ習慣の繰り返しの場合は、
 * このテキスト入力ではなく各カードの「🔁 今日も実施」ボタン（duplicate_of）を使うこと
 * （テキストからのAI自動照合は、無関係なカードに誤って合流させてしまうことがあり見送った）。
 * duplicate_of指定時: 既存カードの「今日も繰り返した」記録。カードは増やさず履歴にだけ積む（AIは呼ばない）。
 * item指定時: 割引購入・ポイント等での無料入手。discount_percent（割引率から逆算）またはoriginal_price
 * （元の金額を直接指定。支払額0円＝ポイント等での全額相殺＝無料入手も表現できる）のどちらかで節約額を
 * サーバー側で確定計算する（絵文字の選定だけAIに任せる）。購入ごとに金額が変わるため、既存カードとの
 * 照合はせず常に新規カードとして登録する。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const body = bodySchema.parse(await req.json());
    const profiles = await getAllProfiles();
    const nameOf = makeNameLookup(profiles);

    if ("item" in body && "original_price" in body) {
      const row = await createDiscountSavingsAction(session.profile_id, {
        item: body.item,
        originalPrice: body.original_price,
        pricePaid: body.price_paid,
        date: body.date ?? businessDateJST(),
      });
      return NextResponse.json({ action: { ...row, owner_name: nameOf(row.owner) } });
    }

    if ("item" in body) {
      const row = await createDiscountSavingsAction(session.profile_id, {
        item: body.item,
        discountPercent: body.discount_percent,
        pricePaid: body.price_paid,
        date: body.date ?? businessDateJST(),
      });
      return NextResponse.json({ action: { ...row, owner_name: nameOf(row.owner) } });
    }

    if ("duplicate_of" in body) {
      const { card } = await logSavingsActionOccurrence({
        action_id: body.duplicate_of,
        owner: session.profile_id,
        date: body.date ?? todayStrJST(),
      }).catch((e) => {
        throw new ApiError(404, e instanceof Error ? e.message : "元のカードが見つかりません");
      });
      return NextResponse.json({ action: { ...card, owner_name: nameOf(card.owner) } });
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
