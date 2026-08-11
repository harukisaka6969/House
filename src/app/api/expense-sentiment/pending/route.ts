import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getHouseholdExpenseAmountsForDate, getSentimentForDate } from "@/lib/expenseSentiment";
import { todayStrJST, prevDayStr } from "@/lib/date";

/** 前日分の支出スワイプ確認が未実施かどうか（ログイン直後に1日1回だけ出す）。 */
export async function GET() {
  try {
    const session = await requireOwnerSession();
    const date = prevDayStr(todayStrJST());
    const [amounts, sentiment] = await Promise.all([
      getHouseholdExpenseAmountsForDate(date),
      getSentimentForDate(session.profile_id, date),
    ]);
    const total = amounts.reduce((s, a) => s + a, 0);
    const hasExpenses = amounts.length > 0;
    const pending = hasExpenses && !sentiment;
    return NextResponse.json({ date, hasExpenses, total, sentiment: sentiment?.sentiment ?? null, pending });
  } catch (e) {
    return errorResponse(e);
  }
}
