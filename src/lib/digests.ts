import "server-only";
import { db } from "./db";
import type { DigestRow, DigestKind } from "./types";

export async function getLatestDigest(ownerId: string, kind: DigestKind): Promise<DigestRow | null> {
  const { data, error } = await db()
    .from("digests")
    .select("*")
    .eq("owner", ownerId)
    .eq("kind", kind)
    .order("period_key", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DigestRow | null) ?? null;
}

export async function getDigest(ownerId: string, kind: DigestKind, periodKey: string): Promise<DigestRow | null> {
  const { data, error } = await db().from("digests").select("*").eq("owner", ownerId).eq("kind", kind).eq("period_key", periodKey).maybeSingle();
  if (error) throw error;
  return (data as DigestRow | null) ?? null;
}

/** 同じowner・kind・period_keyが既にあれば上書きする（cronの再実行・手動再生成の両方で冪等）。 */
export async function upsertDigest(ownerId: string, kind: DigestKind, periodKey: string, body: string): Promise<DigestRow> {
  const { data, error } = await db()
    .from("digests")
    .upsert({ owner: ownerId, kind, period_key: periodKey, body }, { onConflict: "owner,kind,period_key" })
    .select("*")
    .single();
  if (error) throw error;
  return data as DigestRow;
}
