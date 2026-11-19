/**
 * 支出明細の絞り込み（純粋関数のみ・テストから直接読める）。
 *
 * 口座・カテゴリ・誰の支出・立替・支払い方法の切り口ごとに複数の値を選べる。
 * 切り口の中は「どれかに当てはまる（OR）」、切り口どうしは「すべて満たす（AND）」。
 * 何も選んでいない切り口は絞り込まない。
 * 支払い方法はカード単位で記録している（同じカードのQUICPay・Visa等は判定時に同じ呼び名へ寄せ済み）。
 */

export type ExpenseFilterKey = "account" | "category" | "owner" | "paidBy" | "payment";

/** 立替・支払い方法が未設定の支出を選ぶための値。 */
export const NONE_VALUE = "__none__";

export interface FilterableExpense {
  account_id: string;
  category: string;
  owner_name: string;
  masked?: boolean;
  paid_by_name?: string | null;
  payment_method?: string | null;
}

export type ExpenseFilterState = Partial<Record<ExpenseFilterKey, string[]>>;

/** 支出のその切り口での値。相手の第3口座（masked）は立替・支払い方法が分からないのでnull。 */
export function filterValueOf(e: FilterableExpense, key: ExpenseFilterKey): string | null {
  switch (key) {
    case "account":
      return e.account_id;
    case "category":
      return e.category;
    case "owner":
      return e.owner_name;
    case "paidBy":
      return e.masked ? null : (e.paid_by_name ?? NONE_VALUE);
    case "payment":
      return e.masked ? null : (e.payment_method ?? NONE_VALUE);
  }
}

export function matchesExpenseFilters(e: FilterableExpense, filters: ExpenseFilterState): boolean {
  return (Object.entries(filters) as [ExpenseFilterKey, string[] | undefined][]).every(([key, selected]) => {
    if (!selected || selected.length === 0) return true;
    const v = filterValueOf(e, key);
    return v !== null && selected.includes(v);
  });
}

/** 選択肢: その月の支出に実際に出てくる値を、件数の多い順に（未設定は最後に）。 */
export function filterOptions(rows: FilterableExpense[], key: ExpenseFilterKey): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of rows) {
    const v = filterValueOf(e, key);
    if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (a.value === NONE_VALUE ? 1 : b.value === NONE_VALUE ? -1 : b.count - a.count || a.value.localeCompare(b.value)));
}
