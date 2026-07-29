import "server-only";
import { db } from "./db";
import type { NotificationReadRow } from "./types";

async function getOrCreateSeen(ownerId: string): Promise<NotificationReadRow> {
  const { data, error } = await db().from("notification_reads").select("*").eq("owner", ownerId).maybeSingle();
  if (error) throw error;
  if (data) return data as NotificationReadRow;
  const { data: created, error: insErr } = await db().from("notification_reads").insert({ owner: ownerId }).select("*").single();
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
  const seen = await getOrCreateSeen(ownerId);

  const { count: pendingApprovals, error: e1 } = await db()
    .from("shopping_items")
    .select("id", { count: "exact", head: true })
    .eq("needs_approval", true)
    .eq("approved", false)
    .neq("owner", ownerId);
  if (e1) throw e1;

  const { count: approvedMine, error: e2 } = await db()
    .from("shopping_items")
    .select("id", { count: "exact", head: true })
    .eq("owner", ownerId)
    .eq("needs_approval", true)
    .eq("approved", true)
    .gt("approved_at", seen.shopping_seen_at);
  if (e2) throw e2;

  let newMeals = 0;
  if (partnerId) {
    const { count, error: e3 } = await db()
      .from("meal_logs")
      .select("id", { count: "exact", head: true })
      .eq("owner", partnerId)
      .gt("created_at", seen.meals_seen_at);
    if (e3) throw e3;
    newMeals = count ?? 0;
  }

  const p = pendingApprovals ?? 0;
  const a = approvedMine ?? 0;
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
