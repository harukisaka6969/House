export type AccountId = "a1" | "a2" | "a3" | "a4";

export interface Account {
  id: AccountId;
  name: string;
  color: string;
  budget: number;
  sort: number;
}

export interface Profile {
  id: string;
  slug: string;
  name: string;
}

/** Raw expense row as stored in the DB (owner's own view — never masked). */
export interface ExpenseRow {
  id: string;
  owner: string;
  date: string; // YYYY-MM-DD
  account_id: AccountId;
  category: string;
  sub: string | null;
  amount: number;
  memo: string;
  created_at: string;
}

/** Expense as returned by the API — may be masked for the partner's private-account rows. */
export type ExpenseOut =
  | (Omit<ExpenseRow, "owner"> & { owner_name: string; masked?: false })
  | { id: string; account_id: AccountId; category: string; owner_name: string; masked: true };

export interface IncomeRow {
  id: string;
  month: string;
  name: string;
  amount: number;
  owner: string | null;
}

export interface InvestmentRow {
  id: string;
  owner: string;
  date: string;
  name: string;
  amount: number;
  memo: string;
  created_at: string;
}

export interface Judge {
  label: string;
  tone: "good" | "ok" | "warn" | "bad" | "muted";
  note?: string;
}

export interface AccountAggregate extends Account {
  spent: number;
  spentMine: number;
  judge: Judge;
}

export interface MonthAggregates {
  income: number;
  expense: number;
  invest: number;
  balance: number;
  perAccount: AccountAggregate[];
  perCategory: { name: string; value: number }[];
  perDay: Record<string, number>;
  judge: Judge;
  trend: { month: string; 収入: number; 支出: number; 投資: number }[];
  prev: { income: number; expense: number; invest: number } | null;
  cumInvest: number;
  topCats: { name: string; value: number }[];
}
