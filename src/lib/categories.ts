import "server-only";
import { db } from "./db";
import { CATEGORIES } from "./constants";

/** 「その他」の学習結果として自動追加されたカテゴリのみ（固定カテゴリを含まない）。Settings画面の管理UI用。 */
export async function getCustomCategories(): Promise<string[]> {
  const { data, error } = await db().from("custom_categories").select("name").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => r.name as string);
}

/** 使用可能カテゴリ = 固定（その他を除く） + custom_categories + 「その他」（末尾）。spec §4 */
export async function getAllCategories(): Promise<string[]> {
  const customs = await getCustomCategories();
  return [...CATEGORIES.filter((c) => c !== "その他"), ...customs, "その他"];
}
