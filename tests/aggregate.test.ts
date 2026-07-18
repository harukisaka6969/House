import { describe, it, expect } from "vitest";
import {
  isMaskedForViewer,
  maskExpenseRow,
  maskExpenses,
  buildPerAccount,
  buildPerCategory,
  buildPerDay,
  buildMonthTotals,
} from "@/lib/aggregate";
import { accountJudge, monthJudge } from "@/lib/judge";
import type { Account, ExpenseRow } from "@/lib/types";

const HARUKI = "p1-uuid";
const ARISA = "p2-uuid";

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

describe("spec §5 privacy masking (第3口座)", () => {
  const arisaPrivate = row({
    id: "e-arisa-a3",
    owner: ARISA,
    account_id: "a3",
    category: "趣味",
    date: "2026-07-02",
    amount: 5000,
    memo: "サウナ",
    sub: "サウナ",
  });
  const harukiPrivate = row({
    id: "e-haruki-a3",
    owner: HARUKI,
    account_id: "a3",
    category: "交際費",
    date: "2026-07-03",
    amount: 3000,
    memo: "飲み会",
  });
  const arisaPublic = row({
    id: "e-arisa-a1",
    owner: ARISA,
    account_id: "a1",
    category: "食費",
    date: "2026-07-04",
    amount: 2000,
    memo: "スーパー",
  });

  it("flags only the partner's a3 rows as masked-for-viewer", () => {
    expect(isMaskedForViewer(arisaPrivate, HARUKI)).toBe(true);
    expect(isMaskedForViewer(harukiPrivate, HARUKI)).toBe(false); // own a3 row
    expect(isMaskedForViewer(arisaPublic, HARUKI)).toBe(false); // partner's non-a3 row is shared
    expect(isMaskedForViewer(arisaPrivate, ARISA)).toBe(false); // viewer is the owner
  });

  it("omits date/amount/memo/sub keys entirely for masked rows, not just blanks them", () => {
    const out = maskExpenseRow(arisaPrivate, HARUKI, "アリサ");
    expect(out.masked).toBe(true);
    expect(out).not.toHaveProperty("date");
    expect(out).not.toHaveProperty("amount");
    expect(out).not.toHaveProperty("memo");
    expect(out).not.toHaveProperty("sub");
    expect(out).not.toHaveProperty("owner"); // raw profile id must not leak either
    expect(out).toMatchObject({ id: "e-arisa-a3", account_id: "a3", category: "趣味", owner_name: "アリサ" });
  });

  it("a full API response for Haruki never contains Arisa's a3 amount/date/memo, at the JSON level", () => {
    const outputs = maskExpenses([arisaPrivate, harukiPrivate, arisaPublic], HARUKI, (id) =>
      id === ARISA ? "アリサ" : "ハルキ"
    );
    const serialized = JSON.stringify(outputs);
    expect(serialized).not.toContain("5000");
    expect(serialized).not.toContain("サウナ");
    expect(serialized).not.toContain("2026-07-02");
    // sanity: the other two rows ARE present in full
    expect(serialized).toContain("3000");
    expect(serialized).toContain("2000");
  });

  it("keeps everything visible when the owner views their own data", () => {
    const outputs = maskExpenses([arisaPrivate], ARISA, () => "アリサ");
    expect(outputs[0].masked).toBe(false);
  });

  it("excludes the partner's a3 amount from category and daily breakdowns", () => {
    const rows = [arisaPrivate, harukiPrivate, arisaPublic];
    const perCategory = buildPerCategory(rows, HARUKI);
    const perDay = buildPerDay(rows, HARUKI);

    expect(perCategory.find((c) => c.name === "趣味")).toBeUndefined(); // only Arisa's a3 row had this category
    expect(perCategory.find((c) => c.name === "交際費")?.value).toBe(3000);
    expect(perCategory.find((c) => c.name === "食費")?.value).toBe(2000);

    expect(perDay["2026-07-02"]).toBeUndefined();
    expect(perDay["2026-07-03"]).toBe(3000);
    expect(perDay["2026-07-04"]).toBe(2000);
  });

  it("still shares the true per-account total (a3 included) but tracks 'mine' separately", () => {
    const rows = [arisaPrivate, harukiPrivate];
    const perAccount = buildPerAccount(ACCOUNTS, rows, HARUKI);
    const a3 = perAccount.find((a) => a.id === "a3")!;
    expect(a3.spent).toBe(8000); // shared total across both owners
    expect(a3.spentMine).toBe(3000); // only Haruki's own a3 spend
  });

  it("household month totals include the partner's a3 spend (spec: totals are shared)", () => {
    const rows = [arisaPrivate, harukiPrivate];
    const totals = buildMonthTotals([], rows, []);
    expect(totals.expense).toBe(8000);
  });
});

describe("judge logic (ported from money-flow-dashboard.jsx)", () => {
  it("accountJudge thresholds", () => {
    expect(accountJudge(0, 0).label).toBe("予算未設定");
    expect(accountJudge(7000, 10000).label).toBe("余裕あり");
    expect(accountJudge(9500, 10000).label).toBe("順調");
    expect(accountJudge(11000, 10000).label).toBe("注意");
    expect(accountJudge(13000, 10000).label).toBe("使いすぎ");
  });

  it("monthJudge thresholds", () => {
    expect(monthJudge(0, 0).label).toBe("データなし");
    expect(monthJudge(0, 100).label).toBe("収入未入力");
    expect(monthJudge(100000, 70000).label).toBe("優秀"); // 30% savings
    expect(monthJudge(100000, 85000).label).toBe("良好"); // 15%
    expect(monthJudge(100000, 95000).label).toBe("注意"); // 5%
    expect(monthJudge(100000, 120000).label).toBe("使いすぎ"); // deficit
  });
});
