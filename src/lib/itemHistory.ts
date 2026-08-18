import "server-only";
import { db } from "./db";
import { businessDateJST, addDaysStr, dayOfWeek } from "./date";
import type { ItemHistoryRow, ItemHistorySource } from "./types";

export interface NewItemHistoryEntry {
  name: string;
  /** その品目1件分の金額（レシートから読み取れた場合のみ）。未指定/nullなら不明として保存。 */
  amount?: number | null;
}

export interface ItemHistoryContext {
  store?: string;
  category?: string;
  expenseId?: string | null;
}

/** レシートの購入品・食事の内容などの品目名を、検索用に裏で記録する。呼び出し元の主処理（支出・食事の
 * 登録）を止めたくないので、失敗しても例外を投げずログだけ残す想定で使うこと。 */
export async function addItemHistoryEntries(
  ownerId: string,
  date: string,
  source: ItemHistorySource,
  entries: NewItemHistoryEntry[],
  ctx: ItemHistoryContext = {}
): Promise<void> {
  const rows = entries
    .map((e) => ({ name: e.name.trim(), amount: e.amount ?? null }))
    .filter((e) => e.name.length > 0 && e.name.length <= 100)
    .slice(0, 30)
    .map((e) => ({
      owner: ownerId,
      date,
      name: e.name,
      source,
      amount: e.amount,
      store: ctx.store?.trim() ?? "",
      category: ctx.category?.trim() ?? "",
      expense_id: ctx.expenseId ?? null,
    }));
  if (rows.length === 0) return;
  const { error } = await db().from("item_history").insert(rows);
  if (error) throw error;
}

/** 品目名・店名・カテゴリのいずれかにマッチする行を検索する（渡されたowner群のみ・日付の新しい順）。
 * sourceを指定するとpurchase（購入品）/meal（食事）のどちらか一方だけに絞る。 */
export async function searchItemHistory(ownerIds: string[], query: string, source?: ItemHistorySource, limit = 500): Promise<ItemHistoryRow[]> {
  if (ownerIds.length === 0 || !query.trim()) return [];
  const pattern = `%${query.trim()}%`;
  const base = () => {
    let q = db().from("item_history").select("*").in("owner", ownerIds);
    if (source) q = q.eq("source", source);
    return q;
  };
  const [byName, byStore, byCategory] = await Promise.all([
    base().ilike("name", pattern),
    base().ilike("store", pattern),
    base().ilike("category", pattern),
  ]);
  if (byName.error) throw byName.error;
  if (byStore.error) throw byStore.error;
  if (byCategory.error) throw byCategory.error;

  const merged = new Map<string, ItemHistoryRow>();
  for (const r of [...(byName.data ?? []), ...(byStore.data ?? []), ...(byCategory.data ?? [])] as ItemHistoryRow[]) merged.set(r.id, r);
  return Array.from(merged.values())
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/** 指定owner・日付・sourceの品目をすべて返す（検索結果の「その日をタップして展開」用。キーワードでは絞らない）。 */
export async function listItemHistoryForDay(ownerIds: string[], date: string, source: ItemHistorySource): Promise<ItemHistoryRow[]> {
  if (ownerIds.length === 0) return [];
  const { data, error } = await db()
    .from("item_history")
    .select("*")
    .in("owner", ownerIds)
    .eq("date", date)
    .eq("source", source)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ItemHistoryRow[];
}

export interface PeriodTotals {
  thisWeek: number;
  thisMonth: number;
  past3m: number;
  past6m: number;
  pastYear: number;
  allTime: number;
}

function mondayOf(dateStr: string): string {
  const daysSinceMonday = (dayOfWeek(dateStr) + 6) % 7;
  return addDaysStr(dateStr, -daysSinceMonday);
}

/** 「今週・今月」はカレンダー基準、「過去3ヶ月・半年・1年」は今日からの日数さかのぼり、それぞれ今日までの
 * 合計（重複するウィンドウで、期間ごとの排他的な内訳ではない）。 */
function bucketPeriods(rows: { date: string; amount: number }[]): PeriodTotals {
  const today = businessDateJST();
  const weekStart = mondayOf(today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const past3m = addDaysStr(today, -90);
  const past6m = addDaysStr(today, -182);
  const pastYear = addDaysStr(today, -365);
  const sumSince = (cutoff: string) => rows.filter((r) => r.date >= cutoff).reduce((s, r) => s + r.amount, 0);
  return {
    thisWeek: sumSince(weekStart),
    thisMonth: sumSince(monthStart),
    past3m: sumSince(past3m),
    past6m: sumSince(past6m),
    pastYear: sumSince(pastYear),
    allTime: rows.reduce((s, r) => s + r.amount, 0),
  };
}

/** 店名・カテゴリの合計は、品目単位の金額の抜け漏れに影響されないよう、紐づくexpensesの行を
 * 重複なく（distinctなexpense_id）合算する方式で正確な金額を出す。 */
export async function periodTotalsFromExpenseIds(expenseIds: string[]): Promise<PeriodTotals> {
  const ids = Array.from(new Set(expenseIds));
  if (ids.length === 0) return bucketPeriods([]);
  const { data, error } = await db().from("expenses").select("date, amount").in("id", ids);
  if (error) throw error;
  return bucketPeriods((data ?? []) as { date: string; amount: number }[]);
}

/** 品目名の合計は、そもそも1つの支出の中の一部の品目でしかないため、expenses単位では合算できない。
 * 品目ごとに読み取れた金額（amountがnullでない行）だけを合算するベストエフォート集計。 */
export function periodTotalsFromItemRows(rows: ItemHistoryRow[]): { totals: PeriodTotals; unknownCount: number } {
  const known = rows.filter((r): r is ItemHistoryRow & { amount: number } => r.amount !== null);
  return { totals: bucketPeriods(known.map((r) => ({ date: r.date, amount: r.amount }))), unknownCount: rows.length - known.length };
}
