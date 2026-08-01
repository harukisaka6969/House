import "server-only";
import { db } from "./db";
import { nowMonthKeyJST, shiftMonth, periodRange, periodKeyOfDate } from "./date";
import { sumAmount } from "./aggregate";

export interface TrendPoint {
  month: string;
  income: number;
  expense: number;
  invest: number;
}

/** 直近12ヶ月の月別 収入/支出/投資（世帯合計・spec §6 GET /api/trend）。 */
export async function getTrend(): Promise<TrendPoint[]> {
  const months: string[] = [];
  let cursor = nowMonthKeyJST();
  for (let i = 0; i < 12; i++) {
    months.unshift(cursor);
    cursor = shiftMonth(cursor, -1);
  }
  const fromDate = periodRange(months[0]).from;

  const [{ data: incomeRows, error: incErr }, { data: expenseRows, error: expErr }, { data: investRows, error: invErr }] =
    await Promise.all([
      db().from("incomes").select("month, amount").in("month", months),
      db().from("expenses").select("date, amount").gte("date", fromDate),
      db().from("investments").select("date, amount").gte("date", fromDate),
    ]);
  if (incErr) throw incErr;
  if (expErr) throw expErr;
  if (invErr) throw invErr;

  return months.map((month) => ({
    month,
    income: sumAmount((incomeRows ?? []).filter((r) => r.month === month)),
    expense: sumAmount((expenseRows ?? []).filter((r) => periodKeyOfDate(r.date as string) === month)),
    invest: sumAmount((investRows ?? []).filter((r) => periodKeyOfDate(r.date as string) === month)),
  }));
}
