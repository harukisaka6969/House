import "server-only";
import { db } from "./db";
import { addItemHistoryEntries } from "./itemHistory";
import type { MealLogRow, PfcTargetRow } from "./types";

export async function getMealLogsInRange(ownerId: string, fromDate: string, toDateExclusive: string): Promise<MealLogRow[]> {
  const { data, error } = await db()
    .from("meal_logs")
    .select("*")
    .eq("owner", ownerId)
    .gte("date", fromDate)
    .lt("date", toDateExclusive)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MealLogRow[];
}

export interface NewMealLogInput {
  date: string;
  description: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

export async function createMealLog(ownerId: string, input: NewMealLogInput): Promise<MealLogRow> {
  const { data, error } = await db()
    .from("meal_logs")
    .insert({ owner: ownerId, ...input })
    .select("*")
    .single();
  if (error) throw error;
  // 品目履歴（検索専用）への記録はベストエフォート。失敗しても食事ログ自体は成功として扱う。
  if (input.description.trim()) {
    try {
      await addItemHistoryEntries(ownerId, input.date, "meal", [input.description]);
    } catch (e) {
      console.error("item history logging failed", e);
    }
  }
  return data as MealLogRow;
}

export interface MealLogPatch {
  description?: string;
  calories?: number;
  protein_g?: number;
  fat_g?: number;
  carb_g?: number;
}

export async function updateMealLog(id: string, ownerId: string, patch: MealLogPatch): Promise<MealLogRow> {
  const { data, error } = await db().from("meal_logs").update(patch).eq("id", id).eq("owner", ownerId).select("*").single();
  if (error) throw error;
  return data as MealLogRow;
}

export async function deleteMealLog(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("meal_logs").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getPfcTarget(ownerId: string): Promise<PfcTargetRow | null> {
  const { data, error } = await db().from("pfc_targets").select("*").eq("owner", ownerId).maybeSingle();
  if (error) throw error;
  return (data as PfcTargetRow | null) ?? null;
}

export interface PfcTargetInput {
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

export async function upsertPfcTarget(ownerId: string, input: PfcTargetInput): Promise<PfcTargetRow> {
  const { data, error } = await db()
    .from("pfc_targets")
    .upsert({ owner: ownerId, ...input, updated_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw error;
  return data as PfcTargetRow;
}
