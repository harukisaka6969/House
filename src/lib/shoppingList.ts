import "server-only";
import { db } from "./db";
import type { ShoppingItemRow, ShoppingStore } from "./types";

const APPROVAL_STORES: ShoppingStore[] = ["amazon", "other"];
const VALID_STORES: ShoppingStore[] = ["seiyu", "amazon", "conveni", "other"];

export class ValidationError extends Error {}

export async function getShoppingItems(): Promise<ShoppingItemRow[]> {
  const { data, error } = await db()
    .from("shopping_items")
    .select("*")
    .order("bought", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ShoppingItemRow[];
}

export interface NewShoppingItemInput {
  name: string;
  store: ShoppingStore;
}

export async function createShoppingItem(ownerId: string, input: NewShoppingItemInput): Promise<ShoppingItemRow> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("品目名を入力してください");
  if (!VALID_STORES.includes(input.store)) throw new ValidationError(`invalid store: ${input.store}`);
  const needsApproval = APPROVAL_STORES.includes(input.store);
  const { data, error } = await db()
    .from("shopping_items")
    .insert({ owner: ownerId, name, store: input.store, needs_approval: needsApproval, approved: !needsApproval })
    .select("*")
    .single();
  if (error) throw error;
  return data as ShoppingItemRow;
}

/** 作成者本人は承認できない（パートナーのみ）。 */
export async function approveShoppingItem(id: string, approverId: string): Promise<ShoppingItemRow | null> {
  const { data: existing, error: getErr } = await db().from("shopping_items").select("*").eq("id", id).maybeSingle();
  if (getErr) throw getErr;
  if (!existing || existing.owner === approverId) return null;
  const { data, error } = await db()
    .from("shopping_items")
    .update({ approved: true, approved_by: approverId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ShoppingItemRow;
}

/** 承認が必要なのにまだ未承認の項目は購入済みにできない（サーバー側で強制）。 */
export async function setShoppingItemBought(id: string, bought: boolean): Promise<ShoppingItemRow | null> {
  const { data: existing, error: getErr } = await db().from("shopping_items").select("*").eq("id", id).maybeSingle();
  if (getErr) throw getErr;
  if (!existing) return null;
  if (bought && existing.needs_approval && !existing.approved) {
    throw new ValidationError("パートナーの承認が必要です");
  }
  const { data, error } = await db()
    .from("shopping_items")
    .update({ bought, bought_at: bought ? new Date().toISOString() : null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ShoppingItemRow;
}

export async function deleteShoppingItem(id: string): Promise<boolean> {
  const { data, error } = await db().from("shopping_items").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
