import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getOwnExpenseAmountsForDate, getSentimentForDate } from "@/lib/expenseSentiment";
import { todayStrJST } from "@/lib/date";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const date = todayStrJST();
    const [amounts, sentiment] = await Promise.all([
      getOwnExpenseAmountsForDate(session.profile_id, date),
      getSentimentForDate(session.profile_id, date),
    ]);
    const total = amounts.reduce((s, a) => s + a, 0);
    return NextResponse.json({ date, hasExpenses: amounts.length > 0, total, sentiment: sentiment?.sentiment ?? null });
  } catch (e) {
    return errorResponse(e);
  }
}
