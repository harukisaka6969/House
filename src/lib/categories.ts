import "server-only";
import { db } from "./db";
import { CATEGORIES } from "./constants";

/** 使用可能カテゴリ = 固定（その他を除く） + custom_categories + 「その他」（末尾）。spec §4 */
export async function getAllCategories(): Promise<string[]> {
  const { data, error } = await db().from("custom_categories").select("name").order("created_at", { ascending: true });
  if (error) throw error;
  const customs = (data ?? []).map((r) => r.name as string);
  return [...CATEGORIES.filter((c) => c !== "その他"), ...customs, "その他"];
}
