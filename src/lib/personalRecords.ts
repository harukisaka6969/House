import "server-only";
import { db } from "./db";
import type { PersonalRecordRow, RecordMetric } from "./types";

export interface RecordCategorySummaryRow {
  category: string;
  count: number;
  lastDate: string;
}

/** ownerが使っている全カテゴリを、件数・最終記録日つきで返す（新しい記録日順）。 */
export async function getRecordCategories(ownerId: string): Promise<RecordCategorySummaryRow[]> {
  const { data, error } = await db().from("personal_records").select("category, date").eq("owner", ownerId).order("date", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as { category: string; date: string }[];
  const map = new Map<string, RecordCategorySummaryRow>();
  for (const r of rows) {
    const existing = map.get(r.category);
    if (existing) existing.count += 1;
    else map.set(r.category, { category: r.category, count: 1, lastDate: r.date });
  }
  return Array.from(map.values());
}

export async function getRecordsForCategory(ownerId: string, category: string): Promise<PersonalRecordRow[]> {
  const { data, error } = await db().from("personal_records").select("*").eq("owner", ownerId).eq("category", category).order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PersonalRecordRow[];
}

export async function getRecord(id: string, ownerId: string): Promise<PersonalRecordRow | null> {
  const { data, error } = await db().from("personal_records").select("*").eq("id", id).eq("owner", ownerId).maybeSingle();
  if (error) throw error;
  return (data as PersonalRecordRow | null) ?? null;
}

export interface NewRecordInput {
  category: string;
  date: string;
  title: string;
  metrics: RecordMetric[];
  memo?: string;
}

export async function createRecord(ownerId: string, input: NewRecordInput): Promise<PersonalRecordRow> {
  const { data, error } = await db()
    .from("personal_records")
    .insert({
      owner: ownerId,
      category: input.category.trim() || "その他",
      date: input.date,
      title: input.title.trim(),
      metrics: input.metrics,
      memo: input.memo?.trim() ?? "",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PersonalRecordRow;
}

export interface RecordPatch {
  category?: string;
  date?: string;
  title?: string;
  metrics?: RecordMetric[];
  memo?: string;
}

export async function updateRecord(id: string, ownerId: string, patch: RecordPatch): Promise<PersonalRecordRow | null> {
  const update: Record<string, unknown> = {};
  if (patch.category !== undefined) update.category = patch.category.trim() || "その他";
  if (patch.date !== undefined) update.date = patch.date;
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.metrics !== undefined) update.metrics = patch.metrics;
  if (patch.memo !== undefined) update.memo = patch.memo.trim();

  const { data, error } = await db().from("personal_records").update(update).eq("id", id).eq("owner", ownerId).select("*").maybeSingle();
  if (error) throw error;
  return (data as PersonalRecordRow | null) ?? null;
}

export async function deleteRecord(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("personal_records").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
