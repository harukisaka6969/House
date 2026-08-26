import "server-only";
import { periodRange, shiftMonth, DASHBOARD_MIN_MONTH } from "./date";
import { getExpensesInRange } from "./expenses";
import { getIncomesInMonthRange } from "./incomes";
import { getAccounts } from "./accounts";
import { buildPerAccount, sumAmount } from "./aggregate";
import type { AccountAggregate } from "./types";

export interface FlowPeriodResult {
  months: number;
  income: number;
  perAccount: AccountAggregate[];
}

function monthsBetweenInclusive(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am) + 1;
}

/** monthKeyで終わる直近months期間ぶんの「収入→口座配分」集計。予算は月次budget×months（実際に
 * 含まれた月数）としてaccountJudge（消化率判定）にかける — 単月表示（お金の流れ）と同じ判定ロジックを
 * 期間トータルにもそのまま適用するため。DASHBOARD_MIN_MONTHより前へは遡らない（実際の月数が
 * 要求より少なくなった場合はそのぶんmonthsも縮める）。 */
export async function getFlowPeriod(
  monthKey: string,
  months: number,
  ownerFilter: string | undefined,
  viewerProfileId: string
): Promise<FlowPeriodResult> {
  const requestedStart = shiftMonth(monthKey, -(months - 1));
  const startMonth = requestedStart < DASHBOARD_MIN_MONTH ? DASHBOARD_MIN_MONTH : requestedStart;
  const actualMonths = Math.max(monthsBetweenInclusive(startMonth, monthKey), 1);
  const { from } = periodRange(startMonth);
  const { toExclusive } = periodRange(monthKey);

  const [expenseRows, incomeRows, accounts] = await Promise.all([
    getExpensesInRange(from, toExclusive),
    getIncomesInMonthRange(startMonth, monthKey),
    getAccounts(),
  ]);

  const aggExpenses = ownerFilter ? expenseRows.filter((e) => e.owner === ownerFilter) : expenseRows;
  const aggIncomes = ownerFilter ? incomeRows.filter((i) => i.owner === ownerFilter || i.owner === null) : incomeRows;

  const scaledAccounts = accounts.map((a) => ({ ...a, budget: a.budget * actualMonths }));
  const perAccount = buildPerAccount(scaledAccounts, aggExpenses, viewerProfileId);
  const income = sumAmount(aggIncomes);

  return { months: actualMonths, income, perAccount };
}
