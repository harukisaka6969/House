import "server-only";
import { randomBytes } from "crypto";
import { db } from "./db";
import { getAllProfiles } from "./profiles";

export interface SplitEventRow {
  id: string;
  name: string;
  created_by: string;
  share_token: string;
  created_at: string;
}

export interface SplitParticipantRow {
  id: string;
  event_id: string;
  name: string;
  created_at: string;
}

export interface SplitExpenseRow {
  id: string;
  event_id: string;
  payer_id: string;
  amount: number;
  memo: string;
  date: string;
  created_at: string;
}

function generateShareToken(): string {
  return randomBytes(24).toString("hex");
}

/** イベント作成時、遥希・アリサ（role=owner）は基本的に参加するため自動で参加者に登録しておく。
 * 実際には片方しか参加していなかった場合は、あとから参加者一覧からその人を削除すればよい。 */
export async function createSplitEvent(ownerId: string, name: string): Promise<SplitEventRow> {
  const { data, error } = await db()
    .from("split_events")
    .insert({ name: name.trim() || "旅行", created_by: ownerId, share_token: generateShareToken() })
    .select("*")
    .single();
  if (error) throw error;
  const event = data as SplitEventRow;

  const profiles = await getAllProfiles();
  const owners = profiles.filter((p) => p.role === "owner");
  if (owners.length > 0) {
    const { error: partErr } = await db()
      .from("split_participants")
      .insert(owners.map((p) => ({ event_id: event.id, name: p.name })));
    if (partErr) throw partErr;
  }

  return event;
}

export async function getSplitEventsForOwner(ownerId: string): Promise<SplitEventRow[]> {
  const { data, error } = await db().from("split_events").select("*").eq("created_by", ownerId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SplitEventRow[];
}

export async function deleteSplitEvent(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("split_events").delete().eq("id", id).eq("created_by", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getSplitEventByToken(token: string): Promise<SplitEventRow | null> {
  const { data, error } = await db().from("split_events").select("*").eq("share_token", token).maybeSingle();
  if (error) throw error;
  return (data as SplitEventRow | null) ?? null;
}

export async function getSplitParticipants(eventId: string): Promise<SplitParticipantRow[]> {
  const { data, error } = await db().from("split_participants").select("*").eq("event_id", eventId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SplitParticipantRow[];
}

export async function addSplitParticipant(eventId: string, name: string): Promise<SplitParticipantRow> {
  const { data, error } = await db().from("split_participants").insert({ event_id: eventId, name: name.trim() }).select("*").single();
  if (error) throw error;
  return data as SplitParticipantRow;
}

/** 参加者を削除する（例: 自動登録された遥希・アリサのうち片方が実際には参加していなかった場合）。
 * その人が絡む支出・負担分もFKのon delete cascadeで一緒に削除される。 */
export async function deleteSplitParticipant(participantId: string, eventId: string): Promise<boolean> {
  const { data, error } = await db().from("split_participants").delete().eq("id", participantId).eq("event_id", eventId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getSplitExpenses(eventId: string): Promise<SplitExpenseRow[]> {
  const { data, error } = await db().from("split_expenses").select("*").eq("event_id", eventId).order("date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SplitExpenseRow[];
}

/** expense_id -> participant_idの配列。1つのSELECTでイベント内全支出分の受益者をまとめて取得する。 */
export async function getSplitExpenseSharesForEvent(eventId: string): Promise<Record<string, string[]>> {
  const { data, error } = await db()
    .from("split_expense_shares")
    .select("expense_id, participant_id, split_expenses!inner(event_id)")
    .eq("split_expenses.event_id", eventId);
  if (error) throw error;
  const map: Record<string, string[]> = {};
  for (const row of (data ?? []) as { expense_id: string; participant_id: string }[]) {
    (map[row.expense_id] ??= []).push(row.participant_id);
  }
  return map;
}

export interface NewSplitExpenseInput {
  payerId: string;
  beneficiaryIds: string[];
  amount: number;
  memo: string;
  date: string;
}

export class SplitValidationError extends Error {}

export async function addSplitExpense(eventId: string, input: NewSplitExpenseInput): Promise<SplitExpenseRow> {
  if (!(input.amount > 0)) throw new SplitValidationError("金額は1円以上で入力してください。");
  if (input.beneficiaryIds.length === 0) throw new SplitValidationError("誰のための支出か、1人以上選んでください。");

  const { data: expense, error } = await db()
    .from("split_expenses")
    .insert({ event_id: eventId, payer_id: input.payerId, amount: input.amount, memo: input.memo.trim(), date: input.date })
    .select("*")
    .single();
  if (error) throw error;

  const shareRows = input.beneficiaryIds.map((participant_id) => ({ expense_id: (expense as SplitExpenseRow).id, participant_id }));
  const { error: shareErr } = await db().from("split_expense_shares").insert(shareRows);
  if (shareErr) throw shareErr;

  return expense as SplitExpenseRow;
}

export async function deleteSplitExpense(expenseId: string, eventId: string): Promise<boolean> {
  const { data, error } = await db().from("split_expenses").delete().eq("id", expenseId).eq("event_id", eventId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
