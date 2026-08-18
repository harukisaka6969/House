import "server-only";
import { db } from "./db";
import { getAllProfiles, getLineUserId } from "./profiles";
import { sendLineMessage } from "./lineNotify";
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
  /** 商品リンク（任意）。http(s)以外や空文字はnull扱いにする。 */
  url?: string | null;
}

export async function createShoppingItem(ownerId: string, input: NewShoppingItemInput): Promise<ShoppingItemRow> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("品目名を入力してください");
  if (!VALID_STORES.includes(input.store)) throw new ValidationError(`invalid store: ${input.store}`);
  const url = input.url?.trim();
  if (url && !/^https?:\/\//i.test(url)) throw new ValidationError("リンクはhttp(s)から始まるURLを入力してください");
  const needsApproval = APPROVAL_STORES.includes(input.store);
  const { data, error } = await db()
    .from("shopping_items")
    .insert({ owner: ownerId, name, store: input.store, url: url || null, needs_approval: needsApproval, approved: !needsApproval })
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
    .update({ approved: true, approved_by: approverId, approved_at: new Date().toISOString() })
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

/** approverIdが承認できる（自分以外が追加した、承認待ちの）項目一覧。LINEの「承認」コマンド用。 */
export async function getPendingApprovalsFor(approverId: string): Promise<ShoppingItemRow[]> {
  const { data, error } = await db()
    .from("shopping_items")
    .select("*")
    .eq("needs_approval", true)
    .eq("approved", false)
    .neq("owner", approverId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ShoppingItemRow[];
}

/** 承認 + 依頼した本人へのLINE通知をまとめて行う（アプリのボタンからでもLINEの「承認」コマンドからでも共通で使う）。 */
export async function approveShoppingItemAndNotify(id: string, approverId: string): Promise<ShoppingItemRow | null> {
  const item = await approveShoppingItem(id, approverId);
  if (!item) return null;
  try {
    const profiles = await getAllProfiles();
    const approver = profiles.find((p) => p.id === approverId);
    const requesterLineId = await getLineUserId(item.owner);
    if (requesterLineId) {
      await sendLineMessage(requesterLineId, `✅ ${approver?.name ?? "パートナー"}が「${item.name}」を承認したよ！`);
    }
  } catch (e) {
    console.error("shopping approve LINE notify failed", e);
  }
  return item;
}

export async function deleteShoppingItem(id: string): Promise<boolean> {
  const { data, error } = await db().from("shopping_items").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
