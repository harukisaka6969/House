import "server-only";
import { db } from "./db";

/** 「出発」オートメーションから呼ばれる。外出開始時刻を記録する。 */
export async function markLeft(slug: string): Promise<void> {
  const { error } = await db()
    .from("home_presence")
    .upsert({ profile_slug: slug, left_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "profile_slug" });
  if (error) throw error;
}

export async function getLeftAt(slug: string): Promise<string | null> {
  const { data, error } = await db().from("home_presence").select("left_at").eq("profile_slug", slug).maybeSingle();
  if (error) throw error;
  return (data as { left_at: string | null } | null)?.left_at ?? null;
}

/** 「到着」処理後に呼ぶ。次の外出まで再トリガーしないよう状態をリセットする。 */
export async function clearLeft(slug: string): Promise<void> {
  const { error } = await db()
    .from("home_presence")
    .upsert({ profile_slug: slug, left_at: null, updated_at: new Date().toISOString() }, { onConflict: "profile_slug" });
  if (error) throw error;
}
