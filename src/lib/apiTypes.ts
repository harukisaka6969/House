import type { AccountId, Judge } from "./types";

export interface AccountOut {
  id: AccountId;
  name: string;
  color: string;
  budget: number;
  sort: number;
}

export interface AccountAggregateOut extends AccountOut {
  spent: number;
  spentMine: number;
  judge: Judge;
}

export type ExpenseOut =
  | {
      id: string;
      date: string;
      account_id: AccountId;
      category: string;
      sub: string | null;
      amount: number;
      memo: string;
      created_at: string;
      owner_name: string;
      masked: false;
    }
  | { id: string; account_id: AccountId; category: string; owner_name: string; masked: true };

export interface IncomeOut {
  id: string;
  month: string;
  name: string;
  amount: number;
  owner: string | null;
  owner_name: string | null;
}

export interface InvestmentOut {
  id: string;
  owner: string;
  date: string;
  name: string;
  amount: number;
  memo: string;
  created_at: string;
  owner_name: string;
}

export interface MonthResponse {
  month: string;
  incomes: IncomeOut[];
  expenses: ExpenseOut[];
  investments: InvestmentOut[];
  aggregates: {
    perAccount: AccountAggregateOut[];
    monthTotals: { income: number; expense: number; invest: number };
    perCategory: { name: string; value: number }[];
    perDay: Record<string, number>;
    cumInvest: number;
  };
}

export interface TrendPoint {
  month: string;
  income: number;
  expense: number;
  invest: number;
}

export interface MeResponse {
  profile: { id: string; slug: string; name: string };
  partner: { name: string; slug: string } | null;
  devices: { id: string; device_name: string; created_at: string }[];
}

export interface SettingsResponse {
  profile: { id: string; slug: string; name: string };
  customCategories: string[];
  accounts: AccountOut[];
}
