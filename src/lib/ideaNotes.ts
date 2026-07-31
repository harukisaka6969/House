import "server-only";
import { db } from "./db";
import type { IdeaNoteRow, IdeaNoteColor, IdeaNoteVisibility, IdeaNoteLinkRow } from "./types";

/** 自分のメモ全部 + パートナーが共有(shared)にしたメモ。 */
export async function getIdeaNotes(ownerId: string, partnerId: string | null): Promise<IdeaNoteRow[]> {
  const mine = await db().from("idea_notes").select("*").eq("owner", ownerId);
  if (mine.error) throw mine.error;

  let shared: IdeaNoteRow[] = [];
  if (partnerId) {
    const r = await db().from("idea_notes").select("*").eq("owner", partnerId).eq("visibility", "shared");
    if (r.error) throw r.error;
    shared = (r.data ?? []) as IdeaNoteRow[];
  }

  const all = [...((mine.data ?? []) as IdeaNoteRow[]), ...shared];
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** 両端が閲覧可能な接続のみ返す。 */
export async function getIdeaNoteLinks(visibleNoteIds: string[]): Promise<IdeaNoteLinkRow[]> {
  if (visibleNoteIds.length === 0) return [];
  const { data, error } = await db().from("idea_note_links").select("*").in("from_note", visibleNoteIds).in("to_note", visibleNoteIds);
  if (error) throw error;
  return (data ?? []) as IdeaNoteLinkRow[];
}

export interface NewIdeaNoteInput {
  content: string;
  photo_data_url?: string | null;
  color: IdeaNoteColor;
  x: number;
  y: number;
}

export async function createIdeaNote(ownerId: string, input: NewIdeaNoteInput): Promise<IdeaNoteRow> {
  const { data, error } = await db()
    .from("idea_notes")
    .insert({
      owner: ownerId,
      content: input.content.trim(),
      photo_data_url: input.photo_data_url ?? null,
      color: input.color,
      x: input.x,
      y: input.y,
      visibility: "private",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as IdeaNoteRow;
}

async function getNote(id: string): Promise<IdeaNoteRow | null> {
  const { data, error } = await db().from("idea_notes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as IdeaNoteRow | null) ?? null;
}

/** ownerか、shared化されたメモならパートナーも編集・移動可能。 */
function canEdit(note: IdeaNoteRow, userId: string): boolean {
  return note.owner === userId || note.visibility === "shared";
}

export interface IdeaNotePatch {
  content?: string;
  color?: IdeaNoteColor;
  x?: number;
  y?: number;
}

export async function updateIdeaNote(id: string, userId: string, patch: IdeaNotePatch): Promise<IdeaNoteRow | null> {
  const note = await getNote(id);
  if (!note || !canEdit(note, userId)) return null;

  const update: Record<string, unknown> = {};
  if (patch.content !== undefined) update.content = patch.content.trim();
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.x !== undefined) update.x = patch.x;
  if (patch.y !== undefined) update.y = patch.y;

  const { data, error } = await db().from("idea_notes").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return (data as IdeaNoteRow | null) ?? null;
}

/** 共有・非共有の切り替えはowner本人のみ。 */
export async function setIdeaNoteVisibility(id: string, ownerId: string, visibility: IdeaNoteVisibility): Promise<IdeaNoteRow | null> {
  const { data, error } = await db().from("idea_notes").update({ visibility }).eq("id", id).eq("owner", ownerId).select("*").maybeSingle();
  if (error) throw error;
  return (data as IdeaNoteRow | null) ?? null;
}

/** 削除はowner本人のみ（共有中でも）。 */
export async function deleteIdeaNote(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("idea_notes").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function createIdeaNoteLink(fromId: string, toId: string, userId: string): Promise<IdeaNoteLinkRow | null> {
  const [a, b] = await Promise.all([getNote(fromId), getNote(toId)]);
  if (!a || !b || !canEdit(a, userId) || !canEdit(b, userId)) return null;
  const { data, error } = await db().from("idea_note_links").insert({ from_note: fromId, to_note: toId }).select("*").single();
  if (error) throw error;
  return data as IdeaNoteLinkRow;
}

export async function deleteIdeaNoteLink(id: string, userId: string): Promise<boolean> {
  const { data: link, error: getErr } = await db().from("idea_note_links").select("*").eq("id", id).maybeSingle();
  if (getErr) throw getErr;
  if (!link) return false;
  const [a, b] = await Promise.all([getNote(link.from_note), getNote(link.to_note)]);
  if (!a || !b || !canEdit(a, userId) || !canEdit(b, userId)) return false;
  const { error } = await db().from("idea_note_links").delete().eq("id", id);
  if (error) throw error;
  return true;
}
