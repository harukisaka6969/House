import "server-only";
import { db } from "./db";
import type { IdeaNoteRow, IdeaNoteColor, IdeaNoteVisibility, IdeaNoteLinkRow } from "./types";

/** 指定ボードの自分のメモのみ（ボードは共有されないので相手のは含まれない）。 */
export async function getIdeaNotesForBoard(boardId: string, ownerId: string): Promise<IdeaNoteRow[]> {
  const { data, error } = await db().from("idea_notes").select("*").eq("board_id", boardId).eq("owner", ownerId);
  if (error) throw error;
  return (data ?? []) as IdeaNoteRow[];
}

/** 共有(shared)ビュー: 個別に共有したメモ + ボードごと共有にしたボードの全メモを、ボードをまたいで1箇所に集約する。 */
export async function getSharedIdeaNotes(ownerId: string, partnerId: string | null): Promise<IdeaNoteRow[]> {
  const ownerIds = partnerId ? [ownerId, partnerId] : [ownerId];

  const individual = await db().from("idea_notes").select("*").in("owner", ownerIds).eq("visibility", "shared");
  if (individual.error) throw individual.error;

  const sharedBoards = await db().from("idea_boards").select("id").in("owner", ownerIds).eq("shared", true);
  if (sharedBoards.error) throw sharedBoards.error;
  const sharedBoardIds = (sharedBoards.data ?? []).map((b) => b.id as string);

  let viaBoard: IdeaNoteRow[] = [];
  if (sharedBoardIds.length > 0) {
    const r = await db().from("idea_notes").select("*").in("board_id", sharedBoardIds);
    if (r.error) throw r.error;
    viaBoard = (r.data ?? []) as IdeaNoteRow[];
  }

  const merged = new Map<string, IdeaNoteRow>();
  for (const n of [...((individual.data ?? []) as IdeaNoteRow[]), ...viaBoard]) merged.set(n.id, n);
  return Array.from(merged.values());
}

/** タイトル・本文をボード横断で検索する（自分の全メモ + 相手の実質共有メモ＝個別共有 or ボード共有）。 */
export async function searchIdeaNotes(ownerId: string, partnerId: string | null, query: string): Promise<IdeaNoteRow[]> {
  const pattern = `%${query}%`;
  const ownerIds = partnerId ? [ownerId, partnerId] : [ownerId];

  const titleHits = await db().from("idea_notes").select("*").in("owner", ownerIds).ilike("title", pattern);
  if (titleHits.error) throw titleHits.error;
  const contentHits = await db().from("idea_notes").select("*").in("owner", ownerIds).ilike("content", pattern);
  if (contentHits.error) throw contentHits.error;

  const merged = new Map<string, IdeaNoteRow>();
  for (const n of [...(titleHits.data ?? []), ...(contentHits.data ?? [])] as IdeaNoteRow[]) merged.set(n.id, n);

  let sharedBoardIds = new Set<string>();
  if (partnerId) {
    const r = await db().from("idea_boards").select("id").eq("owner", partnerId).eq("shared", true);
    if (r.error) throw r.error;
    sharedBoardIds = new Set((r.data ?? []).map((b) => b.id as string));
  }

  return Array.from(merged.values()).filter((n) => n.owner === ownerId || n.visibility === "shared" || sharedBoardIds.has(n.board_id));
}

/** 両端が閲覧可能な接続のみ返す。 */
export async function getIdeaNoteLinks(visibleNoteIds: string[]): Promise<IdeaNoteLinkRow[]> {
  if (visibleNoteIds.length === 0) return [];
  const { data, error } = await db().from("idea_note_links").select("*").in("from_note", visibleNoteIds).in("to_note", visibleNoteIds);
  if (error) throw error;
  return (data ?? []) as IdeaNoteLinkRow[];
}

export interface NewIdeaNoteInput {
  board_id: string;
  title: string;
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
      board_id: input.board_id,
      title: input.title.trim(),
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

/** ボードがshared化されているか（存在しなければfalse扱い）。 */
async function isBoardShared(boardId: string): Promise<boolean> {
  const { data, error } = await db().from("idea_boards").select("shared").eq("id", boardId).maybeSingle();
  if (error) throw error;
  return data?.shared === true;
}

/** owner本人か、メモ個別が共有中か、メモが属するボードごと共有中なら、パートナーも編集・移動可能。 */
async function canEdit(note: IdeaNoteRow, userId: string): Promise<boolean> {
  if (note.owner === userId) return true;
  if (note.visibility === "shared") return true;
  return isBoardShared(note.board_id);
}

export interface IdeaNotePatch {
  title?: string;
  content?: string;
  color?: IdeaNoteColor;
  x?: number;
  y?: number;
}

export async function updateIdeaNote(id: string, userId: string, patch: IdeaNotePatch): Promise<IdeaNoteRow | null> {
  const note = await getNote(id);
  if (!note || !(await canEdit(note, userId))) return null;

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title.trim();
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
  if (!a || !b) return null;
  const [aOk, bOk] = await Promise.all([canEdit(a, userId), canEdit(b, userId)]);
  if (!aOk || !bOk) return null;
  const { data, error } = await db().from("idea_note_links").insert({ from_note: fromId, to_note: toId }).select("*").single();
  if (error) throw error;
  return data as IdeaNoteLinkRow;
}

export async function deleteIdeaNoteLink(id: string, userId: string): Promise<boolean> {
  const { data: link, error: getErr } = await db().from("idea_note_links").select("*").eq("id", id).maybeSingle();
  if (getErr) throw getErr;
  if (!link) return false;
  const [a, b] = await Promise.all([getNote(link.from_note), getNote(link.to_note)]);
  if (!a || !b) return false;
  const [aOk, bOk] = await Promise.all([canEdit(a, userId), canEdit(b, userId)]);
  if (!aOk || !bOk) return false;
  const { error } = await db().from("idea_note_links").delete().eq("id", id);
  if (error) throw error;
  return true;
}
