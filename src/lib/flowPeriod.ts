import "server-only";
import { periodRange, shiftMonth } from "./date";
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

/** monthKeyで終わる直近months期間ぶんの「収入→口座配分」集計。予算は月次budget×monthsとして
 * accountJudge（消化率判定）にかける — 単月表示（お金の流れ）と同じ判定ロジックを期間トータルにも
 * そのまま適用するため。 */
export async function getFlowPeriod(
  monthKey: string,
  months: number,
  ownerFilter: string | undefined,
  viewerProfileId: string
): Promise<FlowPeriodResult> {
  const startMonth = shiftMonth(monthKey, -(months - 1));
  const { from } = periodRange(startMonth);
  const { toExclusive } = periodRange(monthKey);

  const [expenseRows, incomeRows, accounts] = await Promise.all([
    getExpensesInRange(from, toExclusive),
    getIncomesInMonthRange(startMonth, monthKey),
    getAccounts(),
  ]);

  const aggExpenses = ownerFilter ? expenseRows.filter((e) => e.owner === ownerFilter) : expenseRows;
  const aggIncomes = ownerFilter ? incomeRows.filter((i) => i.owner === ownerFilter || i.owner === null) : incomeRows;

  const scaledAccounts = accounts.map((a) => ({ ...a, budget: a.budget * months }));
  const perAccount = buildPerAccount(scaledAccounts, aggExpenses, viewerProfileId);
  const income = sumAmount(aggIncomes);

  return { months, income, perAccount };
}
