import "server-only";
import { db } from "./db";
import type { IdeaBoardRow } from "./types";

/** 1件も無ければ自動でデフォルトボードを作る（新規ユーザーが空手で始まらないように）。 */
export async function getIdeaBoards(ownerId: string): Promise<IdeaBoardRow[]> {
  const { data, error } = await db().from("idea_boards").select("*").eq("owner", ownerId).order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as IdeaBoardRow[];
  if (rows.length > 0) return rows;

  const { data: created, error: insErr } = await db().from("idea_boards").insert({ owner: ownerId, name: "ボード1" }).select("*").single();
  if (insErr) throw insErr;
  return [created as IdeaBoardRow];
}

export async function getIdeaBoard(id: string): Promise<IdeaBoardRow | null> {
  const { data, error } = await db().from("idea_boards").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as IdeaBoardRow | null) ?? null;
}

export async function createIdeaBoard(ownerId: string, name: string): Promise<IdeaBoardRow> {
  const { data, error } = await db()
    .from("idea_boards")
    .insert({ owner: ownerId, name: name.trim() || "新しいボード" })
    .select("*")
    .single();
  if (error) throw error;
  return data as IdeaBoardRow;
}

export async function renameIdeaBoard(id: string, ownerId: string, name: string): Promise<IdeaBoardRow | null> {
  const { data, error } = await db().from("idea_boards").update({ name: name.trim() }).eq("id", id).eq("owner", ownerId).select("*").maybeSingle();
  if (error) throw error;
  return (data as IdeaBoardRow | null) ?? null;
}

/** ボード共有プリセットの切り替え。owner本人のみ。 */
export async function setIdeaBoardShared(id: string, ownerId: string, shared: boolean): Promise<IdeaBoardRow | null> {
  const { data, error } = await db().from("idea_boards").update({ shared }).eq("id", id).eq("owner", ownerId).select("*").maybeSingle();
  if (error) throw error;
  return (data as IdeaBoardRow | null) ?? null;
}

export async function deleteIdeaBoard(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("idea_boards").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
