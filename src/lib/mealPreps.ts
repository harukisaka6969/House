import "server-only";
import { db } from "./db";
import { createMealLog } from "./mealLog";
import type { MealPrepRow, MealLogRow } from "./types";

export class MealPrepError extends Error {}

export async function getMealPreps(ownerId: string): Promise<MealPrepRow[]> {
  const { data, error } = await db().from("meal_preps").select("*").eq("owner", ownerId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MealPrepRow[];
}

export interface NewMealPrepInput {
  name: string;
  total_weight_g: number;
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

export async function createMealPrep(ownerId: string, input: NewMealPrepInput): Promise<MealPrepRow> {
  const { data, error } = await db()
    .from("meal_preps")
    .insert({
      owner: ownerId,
      name: input.name.trim() || "作り置き",
      total_weight_g: input.total_weight_g,
      remaining_weight_g: input.total_weight_g,
      calories: input.calories,
      protein_g: input.protein_g,
      fat_g: input.fat_g,
      carb_g: input.carb_g,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as MealPrepRow;
}

export async function deleteMealPrep(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("meal_preps").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** 作り置き(id)からgramsぶん食べた分を、総量に対する比率で按分してmeal_logsに1件記録し、
 * 残量(remaining_weight_g)を減らす（マイナスにはしない）。按分の計算はAIに頼らず常に確定的。 */
export async function consumeMealPrep(id: string, ownerId: string, grams: number, date: string): Promise<{ log: MealLogRow; prep: MealPrepRow }> {
  const { data: prepData, error: getErr } = await db().from("meal_preps").select("*").eq("id", id).eq("owner", ownerId).maybeSingle();
  if (getErr) throw getErr;
  const prep = prepData as MealPrepRow | null;
  if (!prep) throw new MealPrepError("作り置きが見つかりません");
  if (!(prep.total_weight_g > 0)) throw new MealPrepError("この作り置きの総量が不正です");

  const ratio = grams / prep.total_weight_g;
  const calories = Math.round(prep.calories * ratio);
  const protein_g = Math.round(prep.protein_g * ratio * 10) / 10;
  const fat_g = Math.round(prep.fat_g * ratio * 10) / 10;
  const carb_g = Math.round(prep.carb_g * ratio * 10) / 10;

  const log = await createMealLog(ownerId, {
    date,
    description: `${prep.name} ${grams}g`,
    calories,
    protein_g,
    fat_g,
    carb_g,
  });

  const remaining_weight_g = Math.max(0, prep.remaining_weight_g - grams);
  const { data: updated, error: updateErr } = await db().from("meal_preps").update({ remaining_weight_g }).eq("id", id).select("*").single();
  if (updateErr) throw updateErr;

  return { log, prep: updated as MealPrepRow };
}

const GRAM_RE = /(\d+(?:\.\d+)?)\s*(?:g|ｇ|グラム)/i;

/** テキストに、登録済みの作り置きの名前とグラム数の両方が含まれていれば拾う（LINEでの
 * 「〇〇を150g食べた」のような自然な報告から、按分計算にそのまま繋げるため）。
 * 複数の作り置き名がヒットした場合は、より長く（＝より具体的に）一致した方を優先する。 */
export function matchMealPrepFromText(preps: MealPrepRow[], text: string): { prep: MealPrepRow; grams: number } | null {
  const gramMatch = text.match(GRAM_RE);
  if (!gramMatch) return null;
  const grams = Number(gramMatch[1]);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  const candidates = preps.filter((p) => p.name.trim().length > 0 && text.includes(p.name.trim()));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.name.length - a.name.length);
  return { prep: candidates[0], grams };
}
