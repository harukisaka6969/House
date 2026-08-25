import "server-only";
import { db } from "./db";
import type { BodyGoalRow } from "./types";

export async function getBodyGoal(ownerId: string): Promise<BodyGoalRow | null> {
  const { data, error } = await db().from("body_goals").select("*").eq("owner", ownerId).maybeSingle();
  if (error) throw error;
  return (data as BodyGoalRow | null) ?? null;
}

export interface BodyGoalInput {
  body_fat_pct_target: number | null;
  muscle_trend_kg_per_4w: number | null;
  target_weight?: number | null;
  target_lbm?: number | null;
  target_date?: string | null;
}

export async function upsertBodyGoal(ownerId: string, input: BodyGoalInput): Promise<BodyGoalRow> {
  const { data, error } = await db()
    .from("body_goals")
    .upsert(
      {
        owner: ownerId,
        body_fat_pct_target: input.body_fat_pct_target,
        muscle_trend_kg_per_4w: input.muscle_trend_kg_per_4w,
        target_weight: input.target_weight ?? null,
        target_lbm: input.target_lbm ?? null,
        target_date: input.target_date ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as BodyGoalRow;
}
