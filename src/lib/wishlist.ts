import "server-only";
import { db } from "./db";
import { todayStrJST } from "./date";
import { fetchOgImage } from "./ogImage";
import type { WishlistItemRow } from "./types";

export { visibleWishlistItems, toFamilyWishlist } from "./v2Privacy";

export async function getAllWishlistItems(): Promise<WishlistItemRow[]> {
  const { data, error } = await db().from("wishlist_items").select("*").order("priority", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WishlistItemRow[];
}

export interface NewWishlistInput {
  is_private?: boolean;
  name: string;
  category?: string | null;
  price: number;
  priority?: number;
  target_date?: string | null;
  monthly_plan?: number;
  url?: string | null;
  memo?: string | null;
  visible_to_family?: boolean;
}

export async function createWishlistItem(ownerId: string, input: NewWishlistInput): Promise<WishlistItemRow> {
  const url = input.url?.trim() || null;
  const imageUrl = url ? await fetchOgImage(url) : null;
  const { data, error } = await db()
    .from("wishlist_items")
    .insert({
      owner: ownerId,
      is_private: !!input.is_private,
      name: input.name.trim(),
      category: input.category?.trim() || null,
      price: Math.round(Number(input.price)) || 0,
      priority: input.priority ?? 3,
      target_date: input.target_date?.trim() || null,
      monthly_plan: Math.round(Number(input.monthly_plan)) || 0,
      url,
      image_url: imageUrl,
      memo: input.memo?.trim() ?? "",
      visible_to_family: input.visible_to_family ?? true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WishlistItemRow;
}

export interface UpdateWishlistInput extends Partial<NewWishlistInput> {
  status?: "planning" | "saving" | "purchased" | "dropped";
  saved?: number;
}

/** ownerIdでスコープする — 自分のアイテムしか編集できない（is_privateでなくても他人の作成物は編集不可）。 */
export async function updateWishlistItem(id: string, ownerId: string, input: UpdateWishlistInput): Promise<WishlistItemRow | null> {
  const patch: Record<string, unknown> = {};
  if (input.is_private !== undefined) patch.is_private = input.is_private;
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.price !== undefined) patch.price = Math.round(Number(input.price)) || 0;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.target_date !== undefined) patch.target_date = input.target_date?.trim() || null;
  if (input.monthly_plan !== undefined) patch.monthly_plan = Math.round(Number(input.monthly_plan)) || 0;
  if (input.url !== undefined) {
    const url = input.url?.trim() || null;
    patch.url = url;
    patch.image_url = url ? await fetchOgImage(url) : null;
  }
  if (input.memo !== undefined) patch.memo = input.memo?.trim() ?? "";
  if (input.visible_to_family !== undefined) patch.visible_to_family = input.visible_to_family;
  if (input.status !== undefined) patch.status = input.status;
  if (input.saved !== undefined) patch.saved = Math.round(Number(input.saved)) || 0;
  const { data, error } = await db().from("wishlist_items").update(patch).eq("id", id).eq("owner", ownerId).select("*").maybeSingle();
  if (error) throw error;
  return data as WishlistItemRow | null;
}

/** URLからのOGP自動取得がブロックされるサイト（Akamai等のBot対策があるブランドサイトなど）向けに、
 * 写真を直接アップロードして手動でimage_urlを差し替える／nullで削除する。編集自体（名前・価格等）と
 * 違い、写真の差し替えは相手が登録したアイテムでも手伝えるようにする（非公開アイテムは除く）。 */
export async function setWishlistItemImage(id: string, viewerId: string, imageUrl: string | null): Promise<WishlistItemRow | null> {
  const { data: current, error: selErr } = await db().from("wishlist_items").select("owner, is_private").eq("id", id).maybeSingle();
  if (selErr) throw selErr;
  if (!current) return null;
  if (current.is_private && current.owner !== viewerId) return null;

  const { data, error } = await db().from("wishlist_items").update({ image_url: imageUrl }).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as WishlistItemRow | null;
}

export async function deleteWishlistItem(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("wishlist_items").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export interface PurchaseInput {
  date?: string | null;
  price: number;
  createExpense?: boolean;
  account?: string;
  category?: string;
}

/** statusをpurchasedに + 任意で支出1件登録、をDB関数で1トランザクションとして行う（spec §2.2-4: 二重入力防止）。 */
export async function purchaseWishlistItem(id: string, ownerId: string, input: PurchaseInput): Promise<void> {
  const { error } = await db().rpc("purchase_wishlist_item", {
    p_item_id: id,
    p_purchased_date: input.date?.trim() || todayStrJST(),
    p_purchased_price: Math.round(Number(input.price)) || 0,
    p_owner: ownerId,
    p_create_expense: !!input.createExpense,
    p_account_id: input.account ?? null,
    p_category: input.category ?? null,
  });
  if (error) throw error;
}

export interface ContributeInput {
  amount: number;
  createExpense?: boolean;
  account?: string;
  category?: string;
}

/** savedを加算 + 任意で支出1件登録、をDB関数で1トランザクションとして行う（spec §2.3）。 */
export async function contributeWishlistItem(id: string, ownerId: string, input: ContributeInput): Promise<number> {
  const { data, error } = await db().rpc("contribute_wishlist_item", {
    p_item_id: id,
    p_amount: Math.round(Number(input.amount)) || 0,
    p_owner: ownerId,
    p_create_expense: !!input.createExpense,
    p_account_id: input.account ?? null,
    p_category: input.category ?? null,
  });
  if (error) throw error;
  return data as number;
}
