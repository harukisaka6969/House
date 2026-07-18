import "server-only";
import { db } from "./db";
import type { JournalEntryRow, SportLogRow } from "./types";

/** 日記は非公開 — 本人の分しか取得しない（相手の本文はサーバーからも送らない）。 */
export async function getJournalEntriesInRange(ownerId: string, fromDate: string, toDateExclusive: string): Promise<JournalEntryRow[]> {
  const { data, error } = await db()
    .from("journal_entries")
    .select("*")
    .eq("owner", ownerId)
    .gte("date", fromDate)
    .lt("date", toDateExclusive)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as JournalEntryRow[];
}

export async function getSportLogsInRange(fromDate: string, toDateExclusive: string): Promise<SportLogRow[]> {
  const { data, error } = await db().from("sport_logs").select("*").gte("date", fromDate).lt("date", toDateExclusive).order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SportLogRow[];
}

/** 自分の日記を1日1件でupsertする（他人の日記は編集不可）。 */
export async function upsertJournalEntry(ownerId: string, date: string, body: string): Promise<JournalEntryRow> {
  const { data, error } = await db()
    .from("journal_entries")
    .upsert({ owner: ownerId, date, body, updated_at: new Date().toISOString() }, { onConflict: "owner,date" })
    .select("*")
    .single();
  if (error) throw error;
  return data as JournalEntryRow;
}

export async function deleteJournalEntry(ownerId: string, date: string): Promise<boolean> {
  const { data, error } = await db().from("journal_entries").delete().eq("owner", ownerId).eq("date", date).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export interface NewSportLogInput {
  date: string;
  activity: string;
  duration_minutes?: number | null;
  distance_km?: number | null;
  memo?: string;
}

export async function createSportLog(ownerId: string, input: NewSportLogInput): Promise<SportLogRow> {
  const { data, error } = await db()
    .from("sport_logs")
    .insert({
      owner: ownerId,
      date: input.date,
      activity: input.activity.trim(),
      duration_minutes: input.duration_minutes ?? null,
      distance_km: input.distance_km ?? null,
      memo: input.memo?.trim() ?? "",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as SportLogRow;
}

export async function deleteSportLog(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("sport_logs").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
