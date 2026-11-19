import { describe, it, expect } from "vitest";
import { matchesExpenseFilters, filterOptions, NONE_VALUE, type FilterableExpense } from "@/lib/expenseFilters";

const rows: FilterableExpense[] = [
  { account_id: "a1", category: "食費", owner_name: "共有", paid_by_name: null, payment_method: "共用カード" },
  { account_id: "a3", category: "外食", owner_name: "遥希", paid_by_name: "アリサ", payment_method: "アリサEPOS" },
  { account_id: "a1", category: "日用品", owner_name: "アリサ", paid_by_name: null, payment_method: null },
  { account_id: "a3", category: "趣味", owner_name: "アリサ", masked: true },
];

const pick = (filters: Parameters<typeof matchesExpenseFilters>[1]) => rows.filter((e) => matchesExpenseFilters(e, filters)).map((e) => e.category);

describe("matchesExpenseFilters", () => {
  it("何も選んでいなければ全件", () => {
    expect(pick({})).toHaveLength(4);
    expect(pick({ account: [] })).toHaveLength(4);
  });

  it("切り口の中は複数選択でOR", () => {
    expect(pick({ payment: ["共用カード", "アリサEPOS"] })).toEqual(["食費", "外食"]);
  });

  it("切り口どうしはAND", () => {
    expect(pick({ account: ["a1"], owner: ["アリサ"] })).toEqual(["日用品"]);
  });

  it("未設定（立替なし・支払い方法なし）も選べる", () => {
    expect(pick({ payment: [NONE_VALUE] })).toEqual(["日用品"]);
    expect(pick({ paidBy: [NONE_VALUE] })).toEqual(["食費", "日用品"]);
  });

  it("相手の第3口座（非公開）は、立替・支払い方法で絞り込むと出さない", () => {
    expect(pick({ account: ["a3"] })).toEqual(["外食", "趣味"]);
    expect(pick({ account: ["a3"], payment: ["アリサEPOS"] })).toEqual(["外食"]);
  });
});

describe("filterOptions", () => {
  it("実際に出てくる値を件数の多い順に、未設定は最後に", () => {
    expect(filterOptions(rows, "owner")).toEqual([
      { value: "アリサ", count: 2 },
      { value: "共有", count: 1 },
      { value: "遥希", count: 1 },
    ]);
    expect(filterOptions(rows, "payment").map((o) => o.value)).toEqual(["アリサEPOS", "共用カード", NONE_VALUE]);
  });
});
