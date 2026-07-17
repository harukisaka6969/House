import "server-only";
import { db } from "./db";
import type { AssetRow } from "./types";

export { toFamilyAssets } from "./v2Privacy";

export async function getAssets(): Promise<AssetRow[]> {
  const { data, error } = await db().from("assets").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AssetRow[];
}

export interface NewAssetInput {
  name: string;
  kind: string;
  acquired_date?: string | null;
  memo?: string | null;
}

export async function createAsset(input: NewAssetInput): Promise<AssetRow> {
  const { data, error } = await db()
    .from("assets")
    .insert({
      name: input.name.trim(),
      kind: input.kind,
      acquired_date: input.acquired_date?.trim() || null,
      memo: input.memo?.trim() ?? "",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as AssetRow;
}

export async function updateAsset(id: string, input: Partial<NewAssetInput>): Promise<AssetRow | null> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.acquired_date !== undefined) patch.acquired_date = input.acquired_date?.trim() || null;
  if (input.memo !== undefined) patch.memo = input.memo?.trim() ?? "";
  const { data, error } = await db().from("assets").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as AssetRow | null;
}

export async function deleteAsset(id: string): Promise<boolean> {
  const { data, error } = await db().from("assets").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
