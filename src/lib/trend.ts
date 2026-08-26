import "server-only";
import { db } from "./db";
import { nowMonthKeyJST, shiftMonth, periodRange, periodKeyOfDate, DASHBOARD_MIN_MONTH } from "./date";
import { sumAmount } from "./aggregate";

export interface TrendPoint {
  month: string;
  income: number;
  expense: number;
  invest: number;
}

/** 直近12ヶ月（ただしDASHBOARD_MIN_MONTHより前には遡らない）の月別 収入/支出/投資
 * （既定は世帯合計・spec §6 GET /api/trend）。ownerFilterを指定すると、その人の分
 * （＋owner無しの共有収入）だけに絞る。 */
export async function getTrend(ownerFilter?: string): Promise<TrendPoint[]> {
  const months: string[] = [];
  let cursor = nowMonthKeyJST();
  for (let i = 0; i < 12; i++) {
    if (cursor < DASHBOARD_MIN_MONTH) break;
    months.unshift(cursor);
    cursor = shiftMonth(cursor, -1);
  }
  if (months.length === 0) return [];
  const fromDate = periodRange(months[0]).from;

  const incomeQuery = db().from("incomes").select("month, amount, owner").in("month", months);
  let expenseQuery = db().from("expenses").select("date, amount, owner").gte("date", fromDate);
  let investQuery = db().from("investments").select("date, amount, owner").gte("date", fromDate);
  if (ownerFilter) {
    expenseQuery = expenseQuery.eq("owner", ownerFilter);
    investQuery = investQuery.eq("owner", ownerFilter);
  }

  const [{ data: incomeRowsRaw, error: incErr }, { data: expenseRows, error: expErr }, { data: investRows, error: invErr }] =
    await Promise.all([incomeQuery, expenseQuery, investQuery]);
  if (incErr) throw incErr;
  if (expErr) throw expErr;
  if (invErr) throw invErr;

  const incomeRows = ownerFilter
    ? (incomeRowsRaw ?? []).filter((r) => r.owner === ownerFilter || r.owner === null)
    : incomeRowsRaw ?? [];

  return months.map((month) => ({
    month,
    income: sumAmount(incomeRows.filter((r) => r.month === month)),
    expense: sumAmount((expenseRows ?? []).filter((r) => periodKeyOfDate(r.date as string) === month)),
    invest: sumAmount((investRows ?? []).filter((r) => periodKeyOfDate(r.date as string) === month)),
  }));
}
