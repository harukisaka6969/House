import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { listSavingsActions, createSavingsAction } from "@/lib/savingsActions";
import { estimateSavingsAction } from "@/lib/anthropic";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";
import { todayStrJST, isValidDateStr } from "@/lib/date";

export async function GET() {
  try {
    await requireOwnerSession();
    const [rows, profiles] = await Promise.all([listSavingsActions(), getAllProfiles()]);
    const nameOf = makeNameLookup(profiles);
    const actions = rows.map((r) => ({ ...r, owner_name: nameOf(r.owner) }));
    const totalSaving = rows.reduce((s, r) => s + r.estimated_saving, 0);
    return NextResponse.json({ actions, totalSaving });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  description: z.string().min(1).max(500),
  date: z.string().refine(isValidDateStr).optional(),
});

/** 節約になった行動の説明文を受け取り、AIで経済効果を見積もってからカードとして保存する。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { description, date } = bodySchema.parse(await req.json());
    const estimate = await estimateSavingsAction(description, todayStrJST());
    const row = await createSavingsAction({
      owner: session.profile_id,
      date: date ?? todayStrJST(),
      description,
      title: estimate.title,
      estimated_saving: estimate.estimated_saving,
      reasoning: estimate.reasoning,
      keywords: estimate.keywords,
    });
    const profiles = await getAllProfiles();
    const nameOf = makeNameLookup(profiles);
    return NextResponse.json({ action: { ...row, owner_name: nameOf(row.owner) } });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
