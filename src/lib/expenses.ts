import "server-only";
import { db } from "./db";
import { todayStrJST } from "./date";
import type { AccountId, ExpenseRow } from "./types";

const VALID_ACCOUNTS: AccountId[] = ["a1", "a2", "a3", "a4"];

export interface NewExpenseInput {
  date?: string | null;
  account_id: string;
  category: string;
  sub?: string | null;
  amount: number;
  memo?: string | null;
}

export class ValidationError extends Error {}

function validateEntry(input: NewExpenseInput, allCats: string[]): {
  date: string;
  account_id: AccountId;
  category: string;
  sub: string | null;
  amount: number;
  memo: string;
} {
  if (!VALID_ACCOUNTS.includes(input.account_id as AccountId)) {
    throw new ValidationError(`invalid account_id: ${input.account_id}`);
  }
  if (!allCats.includes(input.category)) {
    throw new ValidationError(`invalid category: ${input.category}`);
  }
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError(`invalid amount: ${input.amount}`);
  }
  // 日付が空・未指定なら当日の日付（JST）で登録する (spec §7-1)
  const date = input.date && input.date.trim() ? input.date.trim() : todayStrJST();
  return {
    date,
    account_id: input.account_id as AccountId,
    category: input.category,
    sub: input.category === "その他" && input.sub?.trim() ? input.sub.trim() : null,
    amount,
    memo: input.memo?.trim() ?? "",
  };
}

/** Adds one or more expenses for `ownerId`, applying the §7 "その他"→カスタムカテゴリ promotion rule atomically via a DB function. */
export async function addExpenseEntries(
  ownerId: string,
  entries: NewExpenseInput[],
  allCats: string[]
): Promise<{ promoted: string[] }> {
  if (entries.length === 0) return { promoted: [] };
  const prepared = entries.map((e) => validateEntry(e, allCats));
  const { data, error } = await db().rpc("add_expense_entries", {
    p_owner: ownerId,
    p_entries: prepared,
  });
  if (error) throw error;
  return { promoted: (data as string[] | null) ?? [] };
}

export async function deleteExpense(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("expenses").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getExpensesInRange(fromDate: string, toDateExclusive: string): Promise<ExpenseRow[]> {
  const { data, error } = await db()
    .from("expenses")
    .select("*")
    .gte("date", fromDate)
    .lt("date", toDateExclusive)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExpenseRow[];
}

export function monthRange(monthKey: string): { from: string; toExclusive: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const from = `${monthKey}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const toExclusive = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
  return { from, toExclusive };
}
