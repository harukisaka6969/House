import "server-only";
import { db } from "./db";

/** 「出発」オートメーションから呼ばれる。外出開始時刻を記録する。 */
export async function markLeft(slug: string): Promise<void> {
  const { error } = await db()
    .from("home_presence")
    .upsert({ profile_slug: slug, left_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "profile_slug" });
  if (error) throw error;
}

/** その人の外出・前回の到着の記録。到着時に、どの出発時刻を使うかの判定に使う。 */
export async function getPresence(slug: string): Promise<{ left_at: string | null; arrived_at: string | null }> {
  const { data, error } = await db().from("home_presence").select("left_at, arrived_at").eq("profile_slug", slug).maybeSingle();
  if (error) throw error;
  const row = data as { left_at: string | null; arrived_at: string | null } | null;
  return { left_at: row?.left_at ?? null, arrived_at: row?.arrived_at ?? null };
}

/** 「到着」で呼ぶ。外出の記録を消し、到着時刻を残す（これより前の出発時刻は次から使わない）。 */
export async function clearLeft(slug: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db()
    .from("home_presence")
    .upsert({ profile_slug: slug, left_at: null, arrived_at: now, updated_at: now }, { onConflict: "profile_slug" });
  if (error) throw error;
}

/** 全員分の外出状態（外出時の消灯ジョブで「家に誰もいなくなったか」を見るため）。 */
export async function getAllPresence(): Promise<{ profile_slug: string; left_at: string | null }[]> {
  const { data, error } = await db().from("home_presence").select("profile_slug, left_at");
  if (error) throw error;
  return (data ?? []) as { profile_slug: string; left_at: string | null }[];
}
