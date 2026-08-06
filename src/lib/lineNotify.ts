import "server-only";

const PUSH_URL = "https://api.line.me/v2/bot/message/push";
const REPLY_URL = "https://api.line.me/v2/bot/message/reply";

export function lineNotifyAvailable(): boolean {
  return !!process.env.LINE_CHANNEL_ACCESS_TOKEN;
}

async function callLineApi(url: string, body: unknown): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`LINE API error ${res.status}: ${text}`);
  }
}

/** 指定したLINEユーザーIDへメッセージをpush送信する。未設定・失敗時も例外を投げない（通知の失敗で本処理を止めないため）。 */
export async function sendLineMessage(lineUserId: string, text: string): Promise<void> {
  if (!lineUserId) return;
  await callLineApi(PUSH_URL, { to: lineUserId, messages: [{ type: "text", text }] }).catch((e) => console.error("sendLineMessage failed", e));
}

/** Webhookで受け取ったreplyTokenへ即時返信する（自分のユーザーID案内など）。 */
export async function replyLineMessage(replyToken: string, text: string): Promise<void> {
  await callLineApi(REPLY_URL, { replyToken, messages: [{ type: "text", text }] }).catch((e) => console.error("replyLineMessage failed", e));
}
