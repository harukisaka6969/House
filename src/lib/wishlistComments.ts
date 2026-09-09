import "server-only";
import { db } from "./db";
import type { WishlistCommentRow } from "./types";

export async function getWishlistCommentsForItems(itemIds: string[]): Promise<WishlistCommentRow[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await db().from("wishlist_comments").select("*").in("item_id", itemIds).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WishlistCommentRow[];
}

/** 登録者本人でなくてもコメントできる（非公開アイテムは登録者以外には表示自体されないので実質対象外）。
 * is_privateな他人のアイテムへの書き込みだけ拒否する（null返却）。 */
export async function addWishlistComment(itemId: string, viewerId: string, body: string): Promise<WishlistCommentRow | null> {
  const { data: item, error: selErr } = await db().from("wishlist_items").select("owner, is_private").eq("id", itemId).maybeSingle();
  if (selErr) throw selErr;
  if (!item) return null;
  if (item.is_private && item.owner !== viewerId) return null;

  const { data, error } = await db()
    .from("wishlist_comments")
    .insert({ item_id: itemId, owner: viewerId, body: body.trim() })
    .select("*")
    .single();
  if (error) throw error;
  return data as WishlistCommentRow;
}

export async function deleteWishlistComment(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("wishlist_comments").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
