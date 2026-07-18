import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getExpensesInRange } from "@/lib/expenses";
import { draftJournalFromExpenses } from "@/lib/anthropic";
import { isValidDateStr, nextDayStr } from "@/lib/date";

/** その日の自分の支出から日記の下書きを生成する（日記が未記入のときの自動下書き用）。 */
export async function POST(_req: Request, ctx: { params: Promise<{ date: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { date } = await ctx.params;
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");

    const rows = await getExpensesInRange(date, nextDayStr(date));
    const mine = rows.filter((r) => r.owner === session.profile_id);
    if (mine.length === 0) return NextResponse.json({ draft: "", hasExpenses: false });

    const draft = await draftJournalFromExpenses(
      date,
      mine.map((e) => ({ category: e.category, amount: e.amount, memo: e.memo }))
    );
    return NextResponse.json({ draft, hasExpenses: true });
  } catch (e) {
    return errorResponse(e);
  }
}
