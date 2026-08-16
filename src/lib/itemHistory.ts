import "server-only";
import { db } from "./db";
import type { ItemHistoryRow, ItemHistorySource } from "./types";

/** レシートの購入品・食事の内容などの品目名を、検索用に裏で記録する。呼び出し元の主処理（支出・食事の
 * 登録）を止めたくないので、失敗しても例外を投げずログだけ残す想定で使うこと。 */
export async function addItemHistoryEntries(
  ownerId: string,
  date: string,
  source: ItemHistorySource,
  names: string[],
  note: string | null = null
): Promise<void> {
  const rows = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0 && n.length <= 100)
    .slice(0, 30)
    .map((name) => ({ owner: ownerId, date, name, source, note: note?.trim() ?? "" }));
  if (rows.length === 0) return;
  const { error } = await db().from("item_history").insert(rows);
  if (error) throw error;
}

/** 品目名をキーワード検索する（渡されたowner群のみ・日付の新しい順）。 */
export async function searchItemHistory(ownerIds: string[], query: string, limit = 300): Promise<ItemHistoryRow[]> {
  if (ownerIds.length === 0 || !query.trim()) return [];
  const pattern = `%${query.trim()}%`;
  const { data, error } = await db()
    .from("item_history")
    .select("*")
    .in("owner", ownerIds)
    .ilike("name", pattern)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ItemHistoryRow[];
}
