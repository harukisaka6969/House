import { describe, it, expect } from "vitest";
import { buildAnalysisExport, type AnalysisFilters, type Granularity } from "@/lib/analysisExport";
import type { Account, ExpenseRow, IncomeRow, InvestmentRow } from "@/lib/types";

const HARUKI = "p1-uuid";
const ARISA = "p2-uuid";
const nameOf = (id: string) => (id === HARUKI ? "ハルキ" : id === ARISA ? "アリサ" : "共有");

const ACCOUNTS: Account[] = [
  { id: "a1", name: "第1口座（生活費）", color: "#F5A524", budget: 180000, sort: 1 },
  { id: "a2", name: "第2口座（ローン等）", color: "#63C7E8", budget: 0, sort: 2 },
  { id: "a3", name: "第3口座（趣味・娯楽・交際）", color: "#2FB8A6", budget: 60000, sort: 3 },
  { id: "a4", name: "第4口座（投資）", color: "#8B7CF6", budget: 80000, sort: 4 },
];

function row(overrides: Partial<ExpenseRow>): ExpenseRow {
  return {
    id: "id-" + Math.random(),
    owner: HARUKI,
    date: "2026-07-01",
    account_id: "a1",
    category: "食費",
    sub: null,
    amount: 1000,
    memo: "",
    created_at: "2026-07-01T00:00:00Z",
    source: "manual",
    ...overrides,
  };
}

const expenseRows: ExpenseRow[] = [
  row({ id: "e1", owner: HARUKI, account_id: "a1", category: "食費", date: "2026-07-01", amount: 3000, memo: "スーパー" }),
  row({ id: "e2", owner: ARISA, account_id: "a3", category: "趣味", date: "2026-07-02", amount: 9999, memo: "秘密", sub: "サウナ" }),
  row({ id: "e3", owner: HARUKI, account_id: "a3", category: "交際費", date: "2026-07-03", amount: 4000 }),
  row({ id: "e4", owner: ARISA, account_id: "a1", category: "日用品", date: "2026-07-04", amount: 2500, memo: "洗剤" }),
];
const incomeRows: IncomeRow[] = [{ id: "i1", month: "2026-07", name: "給与", amount: 400000, owner: null }];
const investmentRows: InvestmentRow[] = [
  { id: "v1", owner: HARUKI, date: "2026-07-05", name: "eMAXIS Slim", amount: 30000, memo: "", created_at: "2026-07-05T00:00:00Z" },
];

function makeFilters(overrides: Partial<AnalysisFilters> = {}): AnalysisFilters {
  return {
    from: "2026-07-01",
    to: "2026-07-31",
    types: new Set(["expenses", "incomes", "investments"]),
    accountIds: null,
    categories: null,
    owner: "all",
    granularity: "raw",
    ...overrides,
  };
}

function run(granularity: Granularity, owner: "me" | "all" = "all") {
  return buildAnalysisExport({
    viewerProfileId: HARUKI,
    requesterName: "ハルキ",
    accounts: ACCOUNTS,
    nameOf,
    expenseRows,
    incomeRows,
    investmentRows,
    filters: makeFilters({ granularity, owner }),
  });
}

describe("spec §12 分析出力 — privacy across every granularity", () => {
  for (const granularity of ["raw", "daily", "monthly"] as Granularity[]) {
    it(`${granularity}: never leaks Arisa's a3 amount/date/memo/sub to Haruki`, () => {
      const result = run(granularity);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("9999");
      expect(serialized).not.toContain("秘密");
      expect(serialized).not.toContain("サウナ");
      expect(serialized).not.toContain("2026-07-02");
    });
  }

  it("raw: masked row appears as a placeholder with only id/account/category/owner/masked", () => {
    const result = run("raw");
    const masked = result.expenses.find((e) => "masked" in e && e.masked);
    expect(masked).toBeDefined();
    expect(masked).toMatchObject({ account: "a3", category: "趣味", owner: "アリサ", masked: true });
    expect(masked).not.toHaveProperty("amount");
    expect(masked).not.toHaveProperty("date");
    expect(masked).not.toHaveProperty("memo");
  });

  it("daily/monthly granularity omits raw expense/income/investment arrays", () => {
    expect(run("daily").expenses).toHaveLength(0);
    expect(run("daily").incomes).toHaveLength(0);
    expect(run("daily").investments).toHaveLength(0);
    expect(run("monthly").expenses).toHaveLength(0);
    expect(run("monthly").daily).toHaveLength(0);
  });

  it("by_category / daily / by_weekday exclude the partner's a3 amount", () => {
    const result = run("raw");
    expect(result.by_category.find((c) => c.category === "趣味")).toBeUndefined();
    expect(result.daily.find((d) => d.date === "2026-07-02")).toBeUndefined();
    const totalWeekday = Object.values(result.by_weekday).reduce((s, v) => s + v, 0);
    expect(totalWeekday).toBe(3000 + 4000 + 2500); // excludes Arisa's 9999 a3 row
  });

  it("by_account.total_all and summary.expense_total_all include the partner's a3 spend (shared truth)", () => {
    const result = run("raw");
    const a3 = result.by_account.find((a) => a.account === "a3")!;
    expect(a3.total_all).toBe(9999 + 4000);
    expect(result.summary.expense_total_all).toBe(3000 + 9999 + 4000 + 2500);
    expect(result.summary.expense_total_visible).toBe(3000 + 4000 + 2500);
  });

  it("owner=me scopes to Haruki's own rows only, with no reference to Arisa's data at all", () => {
    const result = run("raw", "me");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("アリサ");
    expect(result.expenses).toHaveLength(2); // e1, e3 (Haruki's own)
    expect(result.summary.expense_total_visible).toBe(3000 + 4000);
  });

  it("truncates to daily granularity and flags meta.truncated when raw detail exceeds 5000 rows", () => {
    const many: ExpenseRow[] = Array.from({ length: 5001 }, (_, i) =>
      row({ id: `bulk-${i}`, owner: HARUKI, account_id: "a1", category: "食費", date: "2026-07-01", amount: 100 })
    );
    const result = buildAnalysisExport({
      viewerProfileId: HARUKI,
      requesterName: "ハルキ",
      accounts: ACCOUNTS,
      nameOf,
      expenseRows: many,
      incomeRows: [],
      investmentRows: [],
      filters: makeFilters({ granularity: "raw" }),
    });
    expect(result.meta.truncated).toBe(true);
    expect(result.expenses).toHaveLength(0); // fell back to daily granularity
    expect(result.daily.length).toBeGreaterThan(0);
  });
});
