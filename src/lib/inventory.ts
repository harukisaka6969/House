import "server-only";
import { db } from "./db";
import type { InventoryItemRow } from "./types";

export async function getInventoryItems(): Promise<InventoryItemRow[]> {
  const { data, error } = await db().from("inventory_items").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InventoryItemRow[];
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

/** 使った分をquantityから減算する（0未満にはしない）。 */
export async function consumeInventoryItem(id: string, amount: number): Promise<InventoryItemRow | null> {
  const { data: current, error: selErr } = await db().from("inventory_items").select("quantity").eq("id", id).maybeSingle();
  if (selErr) throw selErr;
  if (!current) return null;
  const next = Math.max(current.quantity - Math.round(Number(amount)), 0);
  const { data, error } = await db().from("inventory_items").update({ quantity: next, updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as InventoryItemRow | null;
}

export interface RestockInput {
  amount: number;
  createExpense?: boolean;
  account?: string;
  category?: string;
  price?: number;
}

/** 補充（購入）記録: quantity加算 + 任意で支出登録、をDB関数で1トランザクションとして行う。 */
export async function restockInventoryItem(id: string, ownerId: string, input: RestockInput): Promise<number> {
  const { data, error } = await db().rpc("restock_inventory_item", {
    p_item_id: id,
    p_amount: Math.round(Number(input.amount)) || 0,
    p_owner: ownerId,
    p_create_expense: !!input.createExpense,
    p_account_id: input.account ?? null,
    p_category: input.category ?? null,
    p_price: Math.round(Number(input.price)) || 0,
  });
  if (error) throw error;
  return data as number;
}

/** 在庫が閾値以下のアイテム（低在庫アラート用）。 */
export function lowStockItems(rows: InventoryItemRow[]): InventoryItemRow[] {
  return rows.filter((r) => r.quantity <= r.low_stock_threshold);
}
