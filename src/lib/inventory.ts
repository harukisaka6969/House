import "server-only";
import { db } from "./db";
import { addDaysStr, todayStrJST } from "./date";
import type { InventoryEventRow, InventoryItemRow } from "./types";

const PACE_LOOKBACK_DAYS = 90;
const RECENT_EVENTS_PER_ITEM = 10;

export async function getInventoryItems(): Promise<InventoryItemRow[]> {
  const { data, error } = await db().from("inventory_items").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InventoryItemRow[];
}

async function getRecentInventoryEvents(itemIds: string[]): Promise<InventoryEventRow[]> {
  if (itemIds.length === 0) return [];
  const from = addDaysStr(todayStrJST(), -PACE_LOOKBACK_DAYS);
  const { data, error } = await db()
    .from("inventory_events")
    .select("*")
    .in("item_id", itemIds)
    .gte("date", from)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InventoryEventRow[];
}

export interface InventoryStats {
  weeklyPace: number | null;
  daysUntilEmpty: number | null;
  recentEvents: InventoryEventRow[];
}

/** 直近PACE_LOOKBACK_DAYS日の消費イベントから週あたりの消費ペースを推定し、現在の在庫数から
 * 在庫切れまでの見込み日数を出す。消費イベントが無ければ両方null（データ不足で未算出）。 */
function computeStats(quantity: number, itemEvents: InventoryEventRow[]): InventoryStats {
  const consumeEvents = itemEvents.filter((e) => e.kind === "consume");
  let weeklyPace: number | null = null;
  let daysUntilEmpty: number | null = null;
  if (consumeEvents.length > 0) {
    const totalConsumed = consumeEvents.reduce((s, e) => s + e.amount, 0);
    const oldestDate = consumeEvents.reduce((min, e) => (e.date < min ? e.date : min), consumeEvents[0].date);
    const spanDays = Math.max(1, dateDiffDays(oldestDate, todayStrJST()) + 1);
    weeklyPace = (totalConsumed / spanDays) * 7;
    if (weeklyPace > 0) daysUntilEmpty = Math.round((quantity / weeklyPace) * 7);
  }
  return { weeklyPace, daysUntilEmpty, recentEvents: itemEvents.slice(0, RECENT_EVENTS_PER_ITEM) };
}

function dateDiffDays(fromDate: string, toDate: string): number {
  const a = new Date(`${fromDate}T00:00:00Z`).getTime();
  const b = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

/** 在庫一覧画面用: 各アイテムに消費ペース・在庫切れ見込み日数・直近履歴を付加して返す。 */
export async function getInventoryItemsWithStats(): Promise<(InventoryItemRow & InventoryStats)[]> {
  const items = await getInventoryItems();
  const events = await getRecentInventoryEvents(items.map((i) => i.id));
  const eventsByItem = new Map<string, InventoryEventRow[]>();
  for (const e of events) {
    const list = eventsByItem.get(e.item_id) ?? [];
    list.push(e);
    eventsByItem.set(e.item_id, list);
  }
  return items.map((item) => ({ ...item, ...computeStats(item.quantity, eventsByItem.get(item.id) ?? []) }));
}

export interface NewInventoryInput {
  name: string;
  category?: string;
  unit?: string;
  quantity?: number;
  low_stock_threshold?: number;
  memo?: string;
}

export async function createInventoryItem(input: NewInventoryInput): Promise<InventoryItemRow> {
  const { data, error } = await db()
    .from("inventory_items")
    .insert({
      name: input.name.trim(),
      category: input.category?.trim() || "その他",
      unit: input.unit?.trim() || "個",
      quantity: Math.max(Math.round(Number(input.quantity ?? 0)), 0),
      low_stock_threshold: Math.max(Math.round(Number(input.low_stock_threshold ?? 1)), 0),
      memo: input.memo?.trim() ?? "",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as InventoryItemRow;
}

export interface UpdateInventoryInput extends Partial<NewInventoryInput> {
  quantity?: number;
}

export async function updateInventoryItem(id: string, input: UpdateInventoryInput): Promise<InventoryItemRow | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.category !== undefined) patch.category = input.category?.trim() || "その他";
  if (input.unit !== undefined) patch.unit = input.unit?.trim() || "個";
  if (input.quantity !== undefined) patch.quantity = Math.max(Math.round(Number(input.quantity)), 0);
  if (input.low_stock_threshold !== undefined) patch.low_stock_threshold = Math.max(Math.round(Number(input.low_stock_threshold)), 0);
  if (input.memo !== undefined) patch.memo = input.memo?.trim() ?? "";
  const { data, error } = await db().from("inventory_items").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as InventoryItemRow | null;
}

export async function deleteInventoryItem(id: string): Promise<boolean> {
  const { data, error } = await db().from("inventory_items").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** 使った分をquantityから減算する（0未満にはしない）。消費ペース算出用に履歴も記録する
 * （DB関数で数量更新と履歴記録を1トランザクションとして行う）。dateを省略すると今日扱い。 */
export async function consumeInventoryItem(id: string, amount: number, date?: string): Promise<InventoryItemRow | null> {
  const params: Record<string, unknown> = { p_item_id: id, p_amount: Math.round(Number(amount)) || 0 };
  if (date) params.p_date = date;
  const { data, error } = await db().rpc("consume_inventory_item", params);
  if (error) throw error;
  if (data === null) return null;
  const { data: item, error: selErr } = await db().from("inventory_items").select("*").eq("id", id).maybeSingle();
  if (selErr) throw selErr;
  return item as InventoryItemRow | null;
}

export interface RestockInput {
  amount: number;
  createExpense?: boolean;
  account?: string;
  category?: string;
  price?: number;
  /** 購入日（省略時は今日）。 */
  date?: string;
}

/** 補充（購入）記録: quantity加算 + 履歴記録 + 任意で支出登録、をDB関数で1トランザクションとして行う。 */
export async function restockInventoryItem(id: string, ownerId: string, input: RestockInput): Promise<number> {
  const params: Record<string, unknown> = {
    p_item_id: id,
    p_amount: Math.round(Number(input.amount)) || 0,
    p_owner: ownerId,
    p_create_expense: !!input.createExpense,
    p_account_id: input.account ?? null,
    p_category: input.category ?? null,
    p_price: Math.round(Number(input.price)) || 0,
  };
  if (input.date) params.p_date = input.date;
  const { data, error } = await db().rpc("restock_inventory_item", params);
  if (error) throw error;
  return data as number;
}

/** 在庫が閾値以下のアイテム（低在庫アラート用）。 */
export function lowStockItems(rows: InventoryItemRow[]): InventoryItemRow[] {
  return rows.filter((r) => r.quantity <= r.low_stock_threshold);
}
