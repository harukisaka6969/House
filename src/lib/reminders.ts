import "server-only";
import { db } from "./db";
import { todayStrJST } from "./date";
import type { ReminderRow, RecurrenceType } from "./types";

export { nextOccurrence, resolveNextDate } from "./reminderRecurrence";

export async function getReminders(): Promise<ReminderRow[]> {
  const { data, error } = await db().from("reminders").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReminderRow[];
}

export interface NewReminderInput {
  name: string;
  recurrence_type: RecurrenceType;
  day_of_week?: number | null;
  day_of_month?: number | null;
  memo?: string;
}

export async function createReminder(input: NewReminderInput): Promise<ReminderRow> {
  const { data, error } = await db()
    .from("reminders")
    .insert({
      name: input.name.trim(),
      recurrence_type: input.recurrence_type,
      day_of_week: input.recurrence_type === "weekly" ? input.day_of_week ?? 0 : null,
      day_of_month: input.recurrence_type === "monthly" ? input.day_of_month ?? 1 : null,
      memo: input.memo?.trim() ?? "",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ReminderRow;
}

export interface ReminderPatch {
  name?: string;
  recurrence_type?: RecurrenceType;
  day_of_week?: number | null;
  day_of_month?: number | null;
  memo?: string;
  active?: boolean;
  /** trueで「今日の分を完了」、falseで取り消し。 */
  done?: boolean;
}

export async function updateReminder(id: string, patch: ReminderPatch): Promise<ReminderRow | null> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.memo !== undefined) update.memo = patch.memo.trim();
  if (patch.active !== undefined) update.active = patch.active;
  if (patch.done !== undefined) update.last_completed_date = patch.done ? todayStrJST() : null;
  if (patch.recurrence_type !== undefined) {
    update.recurrence_type = patch.recurrence_type;
    update.day_of_week = patch.recurrence_type === "weekly" ? patch.day_of_week ?? 0 : null;
    update.day_of_month = patch.recurrence_type === "monthly" ? patch.day_of_month ?? 1 : null;
  }
  const { data, error } = await db().from("reminders").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return (data as ReminderRow | null) ?? null;
}

export async function deleteReminder(id: string): Promise<boolean> {
  const { data, error } = await db().from("reminders").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
