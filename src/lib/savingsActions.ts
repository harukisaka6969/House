import "server-only";
import { db } from "./db";

export interface SavingsActionRow {
  id: string;
  owner: string;
  date: string;
  description: string;
  title: string;
  estimated_saving: number;
  reasoning: string;
  keywords: string[];
  emoji: string;
  created_at: string;
}

const LIST_LIMIT = 500;

/** 世帯で共有する節約アクション一覧（誰が記録したかに関わらず全件）。新しい順。 */
export async function listSavingsActions(): Promise<SavingsActionRow[]> {
  const { data, error } = await db()
    .from("savings_actions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return (data ?? []) as SavingsActionRow[];
}

export async function getSavingsActionById(id: string): Promise<SavingsActionRow | null> {
  const { data, error } = await db().from("savings_actions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as SavingsActionRow | null;
}

export async function createSavingsAction(input: {
  owner: string;
  date: string;
  description: string;
  title: string;
  estimated_saving: number;
  reasoning: string;
  keywords: string[];
  emoji: string;
}): Promise<SavingsActionRow> {
  const { data, error } = await db().from("savings_actions").insert(input).select("*").single();
  if (error) throw error;
  return data as SavingsActionRow;
}

export async function deleteSavingsAction(id: string): Promise<boolean> {
  const { data, error } = await db().from("savings_actions").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
