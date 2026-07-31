import "server-only";
import { db } from "./db";
import type { IdeaNoteRow, IdeaNoteColor } from "./types";

export async function getIdeaNotes(ownerId: string): Promise<IdeaNoteRow[]> {
  const { data, error } = await db().from("idea_notes").select("*").eq("owner", ownerId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as IdeaNoteRow[];
}

export interface NewIdeaNoteInput {
  content: string;
  photo_data_url?: string | null;
  color: IdeaNoteColor;
}

export async function createIdeaNote(ownerId: string, input: NewIdeaNoteInput): Promise<IdeaNoteRow> {
  const { data, error } = await db()
    .from("idea_notes")
    .insert({ owner: ownerId, content: input.content.trim(), photo_data_url: input.photo_data_url ?? null, color: input.color })
    .select("*")
    .single();
  if (error) throw error;
  return data as IdeaNoteRow;
}

export interface IdeaNotePatch {
  content?: string;
  color?: IdeaNoteColor;
}

export async function updateIdeaNote(id: string, ownerId: string, patch: IdeaNotePatch): Promise<IdeaNoteRow | null> {
  const update: Record<string, unknown> = {};
  if (patch.content !== undefined) update.content = patch.content.trim();
  if (patch.color !== undefined) update.color = patch.color;
  const { data, error } = await db().from("idea_notes").update(update).eq("id", id).eq("owner", ownerId).select("*").maybeSingle();
  if (error) throw error;
  return (data as IdeaNoteRow | null) ?? null;
}

export async function deleteIdeaNote(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("idea_notes").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
