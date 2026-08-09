import "server-only";
import { db } from "./db";
import type { AnniversaryRow } from "./types";

export { anniversariesOnDate, anniversariesInYear, nextOccurrence, daysUntil, yearsSince } from "./anniversaryMath";

/** 世帯共有・オーナー区分なし（life_eventsと同じ扱い）。 */
export async function getAnniversaries(): Promise<AnniversaryRow[]> {
  const { data, error } = await db().from("anniversaries").select("*").order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AnniversaryRow[];
}

export interface NewAnniversaryInput {
  name: string;
  date: string;
  memo?: string;
}

export async function createAnniversary(input: NewAnniversaryInput): Promise<AnniversaryRow> {
  const { data, error } = await db()
    .from("anniversaries")
    .insert({ name: input.name.trim(), date: input.date, memo: input.memo?.trim() ?? "" })
    .select("*")
    .single();
  if (error) throw error;
  return data as AnniversaryRow;
}

export type UpdateAnniversaryInput = Partial<NewAnniversaryInput>;

export async function updateAnniversary(id: string, input: UpdateAnniversaryInput): Promise<AnniversaryRow | null> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.date !== undefined) patch.date = input.date;
  if (input.memo !== undefined) patch.memo = input.memo?.trim() ?? "";
  const { data, error } = await db().from("anniversaries").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as AnniversaryRow | null;
}

export async function deleteAnniversary(id: string): Promise<boolean> {
  const { data, error } = await db().from("anniversaries").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
