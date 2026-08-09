import "server-only";
import { db } from "./db";

/** LINEのWebhookが同じメッセージを再送してきた場合に、二重処理（支出の重複登録など）を防ぐ。
 * 初めて見るmessage_idならfalse（未処理）を返して記録し、既に処理済みならtrueを返す。
 * message_idにひもづく行を先に確保できたリクエストだけが処理を進める（一意制約でレース条件も防ぐ）。 */
export async function isDuplicateLineMessage(messageId: string): Promise<boolean> {
  const { error } = await db().from("line_processed_messages").insert({ message_id: messageId });
  if (!error) return false;
  if (error.code === "23505") return true; // unique_violation = 既に処理済み
  console.error("line dedup insert failed", error);
  return false; // 想定外のエラーでは処理をブロックしない（fail open）
}
