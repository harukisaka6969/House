import { PRIVATE_ACCOUNT } from "./constants";
import { accountJudge, monthJudge } from "./judge";
import type { Account, AccountAggregate, ExpenseOut, ExpenseRow, IncomeRow, InvestmentRow, Judge } from "./types";

/**
 * Privacy core (spec §5). A row is masked in the API response iff it belongs
 * to the OTHER profile and sits in the private account (a3). Masked rows
 * carry only { id, account_id, category, owner_name, masked: true } — the
 * date/amount/memo/sub keys are omitted entirely, not just blanked, so a
 * naive client that ignores `masked` still can't recover the values.
 */
export function isMaskedForViewer(row: Pick<ExpenseRow, "account_id" | "owner">, viewerProfileId: string): boolean {
  return row.account_id === PRIVATE_ACCOUNT && row.owner !== viewerProfileId;
}

export function maskExpenseRow(
  row: ExpenseRow,
  viewerProfileId: string,
  ownerName: string
): ExpenseOut {
  if (isMaskedForViewer(row, viewerProfileId)) {
    return { id: row.id, account_id: row.account_id, category: row.category, owner_name: ownerName, masked: true };
  }
  const { owner: _owner, ...rest } = row;
  void _owner;
  return { ...rest, owner_name: ownerName, masked: false };
}

export function maskExpenses(
  rows: ExpenseRow[],
  viewerProfileId: string,
  ownerNameOf: (profileId: string) => string
): ExpenseOut[] {
  return rows.map((r) => maskExpenseRow(r, viewerProfileId, ownerNameOf(r.owner)));
}

/** Rows usable for aggregation that must exclude the partner's private-account spending. */
function visibleForAggregation(rows: ExpenseRow[], viewerProfileId: string): ExpenseRow[] {
  return rows.filter((r) => !isMaskedForViewer(r, viewerProfileId));
}

export function sumAmount(rows: { amount: number }[]): number {
  return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}

/** perAccount: spent/spentMine are TRUE totals (a3 partner spend included) — only the per-category/per-day/topline breakdowns hide the partner's a3 amounts (spec §5). */
export function buildPerAccount(accounts: Account[], expenses: ExpenseRow[], viewerProfileId: string): AccountAggregate[] {
  return accounts.map((a) => {
    const rows = expenses.filter((e) => e.account_id === a.id);
    const spent = sumAmount(rows);
    const spentMine = sumAmount(rows.filter((e) => e.owner === viewerProfileId));
    return { ...a, spent, spentMine, judge: accountJudge(spent, a.budget) };
  });
}

export function buildPerCategory(expenses: ExpenseRow[], viewerProfileId: string): { name: string; value: number }[] {
  const visible = visibleForAggregation(expenses, viewerProfileId);
  const totals = new Map<string, number>();
  for (const e of visible) {
    const key = e.category || "その他";
    totals.set(key, (totals.get(key) ?? 0) + (Number(e.amount) || 0));
  }
  return [...totals.entries()].map(([name, value]) => ({ name, value })).filter((c) => c.value > 0);
}

export function buildPerDay(expenses: ExpenseRow[], viewerProfileId: string): Record<string, number> {
  const visible = visibleForAggregation(expenses, viewerProfileId);
  const totals: Record<string, number> = {};
  for (const e of visible) {
    totals[e.date] = (totals[e.date] ?? 0) + (Number(e.amount) || 0);
  }
  return totals;
}

export interface MonthTotals {
  income: number;
  expense: number;
  invest: number;
}

/** Household totals — shared regardless of viewer (spec §5: "口座の月合計はa3含む・合計だけは共有"). */
export function buildMonthTotals(incomes: IncomeRow[], expenses: ExpenseRow[], investments: InvestmentRow[]): MonthTotals {
  return {
    income: sumAmount(incomes),
    expense: sumAmount(expenses),
    invest: sumAmount(investments),
  };
}

export function buildMonthJudge(totals: MonthTotals): Judge {
  return monthJudge(totals.income, totals.expense);
}

export function topCategories(perCategory: { name: string; value: number }[], n = 5) {
  return [...perCategory].sort((a, b) => b.value - a.value).slice(0, n);
}
