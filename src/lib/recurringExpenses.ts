import "server-only";
import { db } from "./db";
import type { AccountId, RecurringExpenseRow } from "./types";

const VALID_ACCOUNTS: AccountId[] = ["a1", "a2", "a3", "a4"];

export async function getRecurringExpenses(ownerId: string): Promise<RecurringExpenseRow[]> {
  const { data, error } = await db()
    .from("recurring_expenses")
    .select("*")
    .eq("owner", ownerId)
    .order("day_of_month", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RecurringExpenseRow[];
}

export interface NewRecurringExpenseInput {
  account_id: string;
  category: string;
  amount: number;
  memo?: string;
  day_of_month: number;
}

export class ValidationError extends Error {}

export async function createRecurringExpense(ownerId: string, input: NewRecurringExpenseInput, allCats: string[]): Promise<RecurringExpenseRow> {
  if (!VALID_ACCOUNTS.includes(input.account_id as AccountId)) throw new ValidationError(`invalid account_id: ${input.account_id}`);
  if (!allCats.includes(input.category)) throw new ValidationError(`invalid category: ${input.category}`);
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError(`invalid amount: ${input.amount}`);
  const day = Math.round(Number(input.day_of_month));
  if (!Number.isInteger(day) || day < 1 || day > 28) throw new ValidationError(`invalid day_of_month: ${input.day_of_month}`);

  const { data, error } = await db()
    .from("recurring_expenses")
    .insert({
      owner: ownerId,
      account_id: input.account_id,
      category: input.category,
      amount,
      memo: input.memo?.trim() ?? "",
      day_of_month: day,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as RecurringExpenseRow;
}

export async function setRecurringExpenseActive(id: string, ownerId: string, active: boolean): Promise<boolean> {
  const { data, error } = await db().from("recurring_expenses").update({ active }).eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function deleteRecurringExpense(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("recurring_expenses").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** cron専用: 全ユーザー横断で、指定日が支払日かつ有効な定期支払を取得する。 */
export async function getActiveRecurringExpensesForDay(day: number): Promise<RecurringExpenseRow[]> {
  const { data, error } = await db().from("recurring_expenses").select("*").eq("active", true).eq("day_of_month", day);
  if (error) throw error;
  return (data ?? []) as RecurringExpenseRow[];
}

/** cron専用: その月にすでに生成済みかどうかを記録する（重複生成防止）。 */
export async function markRecurringExpenseGenerated(id: string, monthKey: string): Promise<void> {
  const { error } = await db().from("recurring_expenses").update({ last_generated_month: monthKey }).eq("id", id);
  if (error) throw error;
}
