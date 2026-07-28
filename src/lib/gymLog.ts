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

export async function deleteExercise(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("gym_exercises").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
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
