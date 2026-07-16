import { isMaskedForViewer, sumAmount } from "./aggregate";
import type { Account, ExpenseRow, IncomeRow, InvestmentRow } from "./types";

export type OwnerFilter = "me" | "all";
export type Granularity = "raw" | "daily" | "monthly";

export interface AnalysisFilters {
  from: string;
  to: string;
  types: Set<"expenses" | "incomes" | "investments">;
  accountIds: Set<string> | null;
  categories: Set<string> | null;
  owner: OwnerFilter;
  granularity: Granularity;
}

const RAW_ROW_LIMIT = 5000;

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function inFilter<T>(value: T, set: Set<T> | null): boolean {
  return set === null || set.has(value);
}

export interface AnalysisExportInput {
  viewerProfileId: string;
  requesterName: string;
  accounts: Account[];
  nameOf: (id: string) => string;
  expenseRows: ExpenseRow[]; // already scoped to [from, to)
  incomeRows: IncomeRow[]; // already scoped to months within [from, to)
  investmentRows: InvestmentRow[]; // already scoped to [from, to)
  filters: AnalysisFilters;
}

export function buildAnalysisExport(input: AnalysisExportInput) {
  const { viewerProfileId, requesterName, accounts, nameOf, filters } = input;

  const rowsInScope = input.expenseRows.filter(
    (e) => inFilter(e.account_id, filters.accountIds) && inFilter(e.category, filters.categories)
  );

  const visibleRows =
    filters.owner === "me"
      ? rowsInScope.filter((e) => e.owner === viewerProfileId)
      : rowsInScope.filter((e) => !isMaskedForViewer(e, viewerProfileId));

  const maskedRows =
    filters.owner === "all" ? rowsInScope.filter((e) => isMaskedForViewer(e, viewerProfileId)) : [];

  const incomesInScope = filters.owner === "me" ? input.incomeRows.filter((i) => i.owner === viewerProfileId || !i.owner) : input.incomeRows;
  const investmentsInScope =
    filters.owner === "me" ? input.investmentRows.filter((iv) => iv.owner === viewerProfileId) : input.investmentRows;

  // --- summary ---
  const incomeTotal = sumAmount(incomesInScope);
  const expenseTotalAll = sumAmount(rowsInScope); // household truth (both owners, a3 included) for the filtered scope
  const expenseTotalVisible = sumAmount(visibleRows);
  const investTotal = sumAmount(investmentsInScope);
  const monthsCovered = new Set([...rowsInScope.map((e) => e.date.slice(0, 7)), ...incomesInScope.map((i) => i.month)]).size;
  const savingsRate = incomeTotal > 0 ? (incomeTotal - expenseTotalAll) / incomeTotal : 0;

  // --- monthly ---
  const monthKeys = new Set<string>();
  rowsInScope.forEach((e) => monthKeys.add(e.date.slice(0, 7)));
  investmentsInScope.forEach((iv) => monthKeys.add(iv.date.slice(0, 7)));
  incomesInScope.forEach((i) => monthKeys.add(i.month));
  const monthly = [...monthKeys].sort().map((month) => {
    const monthExpensesAll = rowsInScope.filter((e) => e.date.startsWith(month));
    const monthExpensesVisible = visibleRows.filter((e) => e.date.startsWith(month));
    const monthIncome = sumAmount(incomesInScope.filter((i) => i.month === month));
    const monthInvest = sumAmount(investmentsInScope.filter((iv) => iv.date.startsWith(month)));
    const byAccount: Record<string, number> = {};
    monthExpensesAll.forEach((e) => {
      byAccount[e.account_id] = (byAccount[e.account_id] ?? 0) + e.amount;
    });
    const byCategoryVisible: Record<string, number> = {};
    monthExpensesVisible.forEach((e) => {
      byCategoryVisible[e.category] = (byCategoryVisible[e.category] ?? 0) + e.amount;
    });
    return {
      month,
      income: monthIncome,
      expense_all: sumAmount(monthExpensesAll),
      invest: monthInvest,
      by_account: byAccount,
      by_category_visible: byCategoryVisible,
    };
  });

  // --- daily (§5: 相手a3金額を除外 = visibleRows のみ) ---
  const dailyMap = new Map<string, number>();
  visibleRows.forEach((e) => dailyMap.set(e.date, (dailyMap.get(e.date) ?? 0) + e.amount));
  const daily = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, expense_visible]) => ({ date, expense_visible }));

  // --- by_category (visibleRows のみ) ---
  const catMap = new Map<string, { total: number; count: number }>();
  visibleRows.forEach((e) => {
    const cur = catMap.get(e.category) ?? { total: 0, count: 0 };
    cur.total += e.amount;
    cur.count += 1;
    catMap.set(e.category, cur);
  });
  const by_category = [...catMap.entries()]
    .map(([category, v]) => ({
      category,
      total: v.total,
      count: v.count,
      avg: v.count ? Math.round(v.total / v.count) : 0,
      share: expenseTotalVisible > 0 ? v.total / expenseTotalVisible : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // --- by_account (total_all は常に世帯の真値) ---
  const accountsInScope = filters.accountIds ? accounts.filter((a) => filters.accountIds!.has(a.id)) : accounts;
  const by_account = accountsInScope.map((a) => {
    const total_all = sumAmount(rowsInScope.filter((e) => e.account_id === a.id));
    return {
      account: a.id,
      total_all,
      budget: a.budget,
      utilization: a.budget > 0 ? total_all / a.budget : null,
    };
  });

  // --- by_weekday (visibleRows のみ) ---
  const by_weekday: Record<string, number> = {};
  for (let i = 0; i < 7; i++) by_weekday[String(i)] = 0;
  visibleRows.forEach((e) => {
    const w = String(weekdayOf(e.date));
    by_weekday[w] = (by_weekday[w] ?? 0) + e.amount;
  });

  // --- 明細（truncation判定込み） ---
  const totalDetailRows = visibleRows.length + maskedRows.length + incomesInScope.length + investmentsInScope.length;
  let effectiveGranularity: Granularity = filters.granularity;
  let truncated = false;
  if (filters.granularity === "raw" && totalDetailRows > RAW_ROW_LIMIT) {
    effectiveGranularity = "daily";
    truncated = true;
  }

  const includeDetail = effectiveGranularity === "raw";
  const includeDaily = effectiveGranularity === "raw" || effectiveGranularity === "daily";

  const expensesOut = includeDetail
    ? filters.types.has("expenses")
      ? [
          ...visibleRows.map((e) => ({
            date: e.date,
            account: e.account_id,
            category: e.category,
            sub: e.sub,
            amount: e.amount,
            memo: e.memo,
            owner: nameOf(e.owner),
          })),
          ...maskedRows.map((e) => ({ account: e.account_id, category: e.category, owner: nameOf(e.owner), masked: true as const })),
        ]
      : []
    : [];

  const incomesOut =
    includeDetail && filters.types.has("incomes")
      ? incomesInScope.map((i) => ({ month: i.month, name: i.name, amount: i.amount }))
      : [];

  const investmentsOut =
    includeDetail && filters.types.has("investments")
      ? investmentsInScope.map((iv) => ({ date: iv.date, name: iv.name, amount: iv.amount, owner: nameOf(iv.owner) }))
      : [];

  return {
    meta: {
      generated_at: new Date().toISOString(),
      period: { from: filters.from, to: filters.to },
      filters: {
        types: [...filters.types],
        accounts: filters.accountIds ? [...filters.accountIds] : "all",
        categories: filters.categories ? [...filters.categories] : "all",
        owner: filters.owner,
        granularity: filters.granularity,
      },
      requester: requesterName,
      currency: "JPY",
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, budget_monthly: a.budget })),
      privacy_note:
        "第3口座(a3)の相手の明細は amount/date/memo/sub を含まない(masked:true)。集計値のうち total_all のみ相手分を含む。",
      schema_note: "amounts are integers in JPY. dates are ISO-8601.",
      truncated,
      truncated_reason: truncated ? `明細行数が${RAW_ROW_LIMIT}件を超えたため granularity=daily にフォールバックしました。` : undefined,
    },
    summary: {
      months_covered: monthsCovered,
      income_total: incomeTotal,
      expense_total_all: expenseTotalAll,
      expense_total_visible: expenseTotalVisible,
      invest_total: investTotal,
      savings_rate: Math.round(savingsRate * 1000) / 1000,
    },
    monthly,
    daily: includeDaily ? daily : [],
    by_category,
    by_account,
    by_weekday,
    expenses: expensesOut,
    incomes: incomesOut,
    investments: investmentsOut,
  };
}

export type AnalysisExportResult = ReturnType<typeof buildAnalysisExport>;

export function analysisExportToCsv(result: AnalysisExportResult): string {
  const header = "date,account,category,sub,amount,memo,owner,masked";
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = result.expenses.map((e) => {
    if ("masked" in e && e.masked) {
      return [esc(""), esc(e.account), esc(e.category), esc(""), esc(""), esc(""), esc(e.owner), "1"].join(",");
    }
    const full = e as { date: string; account: string; category: string; sub: string | null; amount: number; memo: string; owner: string };
    return [esc(full.date), esc(full.account), esc(full.category), esc(full.sub ?? ""), esc(full.amount), esc(full.memo), esc(full.owner), "0"].join(",");
  });
  return [header, ...rows].join("\n");
}
