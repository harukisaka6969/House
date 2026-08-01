import "server-only";
import { db } from "./db";
import type { NotificationReadRow } from "./types";

// 初回作成時は「今」ではなくエポックを既読時刻にする — "now"だとその瞬間より前の
// 承認・食事ログがすべて既読扱いになり、本来届くはずの通知が届かなくなるため。
const EPOCH = "1970-01-01T00:00:00.000Z";

async function getOrCreateSeen(ownerId: string): Promise<NotificationReadRow> {
  const { data, error } = await db().from("notification_reads").select("*").eq("owner", ownerId).maybeSingle();
  if (error) throw error;
  if (data) return data as NotificationReadRow;
  const { data: created, error: insErr } = await db()
    .from("notification_reads")
    .insert({ owner: ownerId, shopping_seen_at: EPOCH, meals_seen_at: EPOCH })
    .select("*")
    .single();
  if (insErr) throw insErr;
  return created as NotificationReadRow;
}

export interface NotificationCounts {
  pendingApprovals: number;
  approvedMine: number;
  newMeals: number;
  total: number;
}

/** アプリアイコンバッジ用の通知件数。承認待ちは常に生きた件数、承認済み・新着食事ログは前回見た時刻より後の件数。 */
export async function getNotificationCounts(ownerId: string, partnerId: string | null): Promise<NotificationCounts> {
  const [seen, pending] = await Promise.all([
    getOrCreateSeen(ownerId),
    db().from("shopping_items").select("id", { count: "exact", head: true }).eq("needs_approval", true).eq("approved", false).neq("owner", ownerId),
  ]);
  if (pending.error) throw pending.error;

  const [approved, meals] = await Promise.all([
    db()
      .from("shopping_items")
      .select("id", { count: "exact", head: true })
      .eq("owner", ownerId)
      .eq("needs_approval", true)
      .eq("approved", true)
      .gt("approved_at", seen.shopping_seen_at),
    partnerId
      ? db().from("meal_logs").select("id", { count: "exact", head: true }).eq("owner", partnerId).gt("created_at", seen.meals_seen_at)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  if (approved.error) throw approved.error;
  if (meals.error) throw meals.error;

  const p = pending.count ?? 0;
  const a = approved.count ?? 0;
  const newMeals = meals.count ?? 0;
  return { pendingApprovals: p, approvedMine: a, newMeals, total: p + a + newMeals };
}

export type NotificationKind = "shopping" | "meals";

export async function markNotificationSeen(ownerId: string, kind: NotificationKind): Promise<void> {
  await getOrCreateSeen(ownerId);
  const col = kind === "shopping" ? "shopping_seen_at" : "meals_seen_at";
  const { error } = await db()
    .from("notification_reads")
    .update({ [col]: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("owner", ownerId);
  if (error) throw error;
}
