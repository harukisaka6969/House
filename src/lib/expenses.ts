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

export interface ExpensePatch {
  date?: string;
  account_id?: string;
  category?: string;
  sub?: string | null;
  amount?: number;
  memo?: string;
}

/** 既存の支出（日記由来含む）を部分更新する。渡されたフィールドのみ検証・反映。 */
export async function updateExpense(id: string, ownerId: string, patch: ExpensePatch, allCats: string[]): Promise<ExpenseRow> {
  const update: Record<string, unknown> = {};
  if (patch.account_id !== undefined) {
    if (!VALID_ACCOUNTS.includes(patch.account_id as AccountId)) throw new ValidationError(`invalid account_id: ${patch.account_id}`);
    update.account_id = patch.account_id;
  }
  if (patch.category !== undefined) {
    if (!allCats.includes(patch.category)) throw new ValidationError(`invalid category: ${patch.category}`);
    update.category = patch.category;
  }
  if (patch.amount !== undefined) {
    const amount = Math.round(Number(patch.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError(`invalid amount: ${patch.amount}`);
    update.amount = amount;
  }
  if (patch.date !== undefined && patch.date.trim()) update.date = patch.date.trim();
  if (patch.memo !== undefined) update.memo = patch.memo.trim();
  if (patch.sub !== undefined) update.sub = patch.sub?.trim() || null;

  const { data, error } = await db().from("expenses").update(update).eq("id", id).eq("owner", ownerId).select("*").single();
  if (error) throw error;
  return data as ExpenseRow;
}

export interface JournalExpenseInput {
  account_id: string;
  category: string;
  amount: number;
  memo: string;
}

/** 日記本文から抽出した支出をsource='journal'として登録する。同じ日の日記由来分は再保存のたびに置き換え（冪等）。 */
export async function replaceJournalExpenses(
  ownerId: string,
  date: string,
  entries: JournalExpenseInput[],
  allCats: string[]
): Promise<ExpenseRow[]> {
  const { error: delErr } = await db().from("expenses").delete().eq("owner", ownerId).eq("date", date).eq("source", "journal");
  if (delErr) throw delErr;
  if (entries.length === 0) return [];

  const prepared = entries.map((e) => {
    if (!VALID_ACCOUNTS.includes(e.account_id as AccountId)) throw new ValidationError(`invalid account_id: ${e.account_id}`);
    if (!allCats.includes(e.category)) throw new ValidationError(`invalid category: ${e.category}`);
    const amount = Math.round(Number(e.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError(`invalid amount: ${e.amount}`);
    return {
      owner: ownerId,
      date,
      account_id: e.account_id,
      category: e.category,
      sub: null,
      amount,
      memo: e.memo?.trim() ?? "",
      source: "journal",
    };
  });
  const { data, error } = await db().from("expenses").insert(prepared).select("*");
  if (error) throw error;
  return (data ?? []) as ExpenseRow[];
}

/** その日の、日記から自動抽出された支出のみ（レビュー・編集UI用）。 */
export async function getJournalExpensesForDate(ownerId: string, date: string): Promise<ExpenseRow[]> {
  const { data, error } = await db()
    .from("expenses")
    .select("*")
    .eq("owner", ownerId)
    .eq("date", date)
    .eq("source", "journal")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ExpenseRow[];
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
