import "server-only";
import { db } from "./db";
import type { RehabLogRow, RehabLogKind } from "./types";

/** 完全に本人専用 — 常にownerでフィルタし、他人の分は取得しない。 */
export async function getRehabLogsInRange(ownerId: string, fromDate: string, toDateExclusive: string): Promise<RehabLogRow[]> {
  const { data, error } = await db()
    .from("rehab_logs")
    .select("*")
    .eq("owner", ownerId)
    .gte("date", fromDate)
    .lt("date", toDateExclusive)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RehabLogRow[];
}

export async function createRehabLog(
  ownerId: string,
  date: string,
  kind: RehabLogKind,
  data: Record<string, unknown>
): Promise<RehabLogRow> {
  const { data: row, error } = await db()
    .from("rehab_logs")
    .insert({ owner: ownerId, date, kind, data })
    .select("*")
    .single();
  if (error) throw error;
  return row as RehabLogRow;
}

export async function updateRehabLog(id: string, ownerId: string, data: Record<string, unknown>): Promise<RehabLogRow> {
  const { data: row, error } = await db().from("rehab_logs").update({ data }).eq("id", id).eq("owner", ownerId).select("*").single();
  if (error) throw error;
  return row as RehabLogRow;
}

export async function deleteRehabLog(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("rehab_logs").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
