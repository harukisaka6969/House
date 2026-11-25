import "server-only";
import { db } from "./db";

/** 「割り勘」ボタンを押してから人数を送るまでの猶予。これより古い待ちは無視する。 */
const PENDING_SPLIT_TTL_MS = 30 * 60 * 1000;

/** 「割り勘」ボタンが押された支出を、人数の返事待ちとして覚える（前の待ちは上書き）。 */
export async function setPendingSplit(profileId: string, expenseIds: string[]): Promise<void> {
  const { error } = await db()
    .from("line_pending_splits")
    .upsert({ profile_id: profileId, expense_ids: expenseIds, created_at: new Date().toISOString() }, { onConflict: "profile_id" });
  if (error) throw error;
}

/** 人数の返事待ちの支出を取り出して消す（1回使ったら終わり）。無い・古ければnull。 */
export async function takePendingSplit(profileId: string): Promise<string[] | null> {
  const { data, error } = await db().from("line_pending_splits").select("expense_ids, created_at").eq("profile_id", profileId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { error: delErr } = await db().from("line_pending_splits").delete().eq("profile_id", profileId);
  if (delErr) throw delErr;
  const row = data as { expense_ids: string[]; created_at: string };
  if (Date.now() - new Date(row.created_at).getTime() > PENDING_SPLIT_TTL_MS) return null;
  return row.expense_ids;
}

