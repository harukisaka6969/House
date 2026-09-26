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

/** 返信に添えるワンタップのボタン（LINEのクイックリプライ）。押すとpostbackイベントとしてdataが返る。 */
export interface LineQuickReplyButton {
  label: string;
  /** postbackで送り返される値（例: "paidby:<支出id>"）。 */
  data: string;
  /** 押したときにトーク画面に表示されるテキスト（何を押したか履歴に残すため）。 */
  displayText: string;
}

function quickReplyPayload(buttons: LineQuickReplyButton[] | undefined) {
  if (!buttons || buttons.length === 0) return {};
  return {
    quickReply: {
      // LINEの仕様上、labelは20文字まで。
      items: buttons.slice(0, 13).map((b) => ({
        type: "action" as const,
        action: { type: "postback" as const, label: b.label.slice(0, 20), data: b.data, displayText: b.displayText },
      })),
    },
  };
}

/** Webhookで受け取ったreplyTokenへ即時返信する（自分のユーザーID案内など）。
 * buttonsを渡すと、返信にワンタップのボタン（クイックリプライ）を添える。 */
export async function replyLineMessage(replyToken: string, text: string, buttons?: LineQuickReplyButton[]): Promise<void> {
  await callLineApi(REPLY_URL, {
    replyToken,
    messages: [{ type: "text", text, ...quickReplyPayload(buttons) }],
  }).catch((e) => console.error("replyLineMessage failed", e));
}

/** Claude APIの画像1枚あたりの上限は base64 で 5MB。base64は元バイト数の約4/3になるため、
 * 元データで3.5MBを超えていたら送らずにLINEのプレビュー画像へ切り替える
 * （スマホの高画質写真はこの上限を超えることがあり、そのままではリクエストが400で必ず失敗する）。 */
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;

async function fetchLineContent(url: string, token: string): Promise<{ base64: string; mediaType: string; bytes: number } | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`LINE content fetch error ${res.status} (${url})`);
    return null;
  }
  const mediaType = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mediaType, bytes: buf.byteLength };
}

/** Webhookで受け取った画像メッセージの実体データを取得する（食事写真・レシート写真の自動登録用）。 */
export async function fetchLineImageContent(messageId: string): Promise<{ base64: string; mediaType: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const base = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
    const original = await fetchLineContent(base, token);
    if (!original) return null;
    if (original.bytes <= MAX_IMAGE_BYTES) return { base64: original.base64, mediaType: original.mediaType };

    const preview = await fetchLineContent(`${base}/preview`, token);
    if (preview && preview.bytes <= MAX_IMAGE_BYTES) {
      console.error(`LINE image too large (${original.bytes} bytes), using preview (${preview.bytes} bytes)`);
      return { base64: preview.base64, mediaType: preview.mediaType };
    }
    console.error(`LINE image too large (${original.bytes} bytes) and preview unavailable`);
    return null;
  } catch (e) {
    console.error("fetchLineImageContent failed", e);
    return null;
  }
}
