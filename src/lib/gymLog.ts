import "server-only";
import { db } from "./db";
import type { GymSplitRow, GymExerciseRow, GymExerciseType, GymLogRow, GymSetEntry } from "./types";

export async function getSplits(ownerId: string): Promise<GymSplitRow[]> {
  const { data, error } = await db().from("gym_splits").select("*").eq("owner", ownerId).order("sort", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GymSplitRow[];
}

export async function createSplit(ownerId: string, code: string, label: string, sort: number): Promise<GymSplitRow> {
  const { data, error } = await db().from("gym_splits").insert({ owner: ownerId, code, label, sort }).select("*").single();
  if (error) throw error;
  return data as GymSplitRow;
}

export async function deleteSplit(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("gym_splits").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

const LINE_SPLIT_CODE = "LINE";

/** LINEから新しい種目を記録した際、既存のどの種目名にも一致しなかった場合の受け皿スプリット。
 * 無ければ自動作成する（ユーザーが作った部位別スプリットを勝手に汚さないため）。 */
export async function getOrCreateLineSplit(ownerId: string): Promise<GymSplitRow> {
  const splits = await getSplits(ownerId);
  const existing = splits.find((s) => s.code === LINE_SPLIT_CODE);
  if (existing) return existing;
  return createSplit(ownerId, LINE_SPLIT_CODE, "LINEから記録", splits.length);
}

export async function getExercises(ownerId: string): Promise<GymExerciseRow[]> {
  const { data, error } = await db().from("gym_exercises").select("*").eq("owner", ownerId).order("sort", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GymExerciseRow[];
}

export async function createExercise(
  ownerId: string,
  splitId: string,
  name: string,
  sort: number,
  type: GymExerciseType = "strength"
): Promise<GymExerciseRow> {
  const { data, error } = await db()
    .from("gym_exercises")
    .insert({ owner: ownerId, split_id: splitId, name, sort, type })
    .select("*")
    .single();
  if (error) throw error;
  return data as GymExerciseRow;
}

/** 種目名で既存の種目を探す（前後空白・大小文字の違いは無視した完全一致）。AIのmatched_exercise_id判定が
 * 外れた場合の保険として、LINEからの記録登録時に使う。 */
export function findExerciseByName(exercises: GymExerciseRow[], name: string): GymExerciseRow | null {
  const norm = name.trim().toLowerCase();
  return exercises.find((e) => e.name.trim().toLowerCase() === norm) ?? null;
}

export async function deleteExercise(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("gym_exercises").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** 種目の並び順（sort）・表示/非表示（active）を更新する。並べ替えと、削除せず一時的に隠す用途で使う。 */
export async function updateExercise(
  id: string,
  ownerId: string,
  patch: { sort?: number; active?: boolean }
): Promise<GymExerciseRow | null> {
  const { data, error } = await db().from("gym_exercises").update(patch).eq("id", id).eq("owner", ownerId).select("*").maybeSingle();
  if (error) throw error;
  return data as GymExerciseRow | null;
}

/** 直近の記録一覧（種目ごとの提案・履歴表示用）。件数上限つきで全件取得し、種目ごとにグルーピングして使う。 */
export async function getRecentLogs(ownerId: string, limit = 800): Promise<GymLogRow[]> {
  const { data, error } = await db()
    .from("gym_logs")
    .select("*")
    .eq("owner", ownerId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as GymLogRow[];
}

export interface NewGymLogInput {
  sets: GymSetEntry[];
  durationMinutes: number | null;
  distanceKm: number | null;
  note: string;
}

export async function createLog(ownerId: string, exerciseId: string, date: string, input: NewGymLogInput): Promise<GymLogRow> {
  const { data, error } = await db()
    .from("gym_logs")
    .insert({
      owner: ownerId,
      exercise_id: exerciseId,
      date,
      sets: input.sets,
      duration_minutes: input.durationMinutes,
      distance_km: input.distanceKm,
      note: input.note,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as GymLogRow;
}

export async function deleteLog(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("gym_logs").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

const GYM_SESSION_GAP_MS = 3 * 60 * 60 * 1000;

/** 直前の記録からGYM_SESSION_GAP_MS以上空いていれば「新しいジム訪問」とみなす（同じ日に2回行っても3時間空いていれば別回扱い）。 */
export async function isNewGymSession(ownerId: string, newLogId: string, newLogCreatedAt: string): Promise<boolean> {
  const { data, error } = await db()
    .from("gym_logs")
    .select("created_at")
    .eq("owner", ownerId)
    .neq("id", newLogId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const prev = data?.[0] as { created_at: string } | undefined;
  if (!prev) return true;
  return new Date(newLogCreatedAt).getTime() - new Date(prev.created_at).getTime() >= GYM_SESSION_GAP_MS;
}
