import { NextResponse } from "next/server";
import crypto from "crypto";
import { replyLineMessage, sendLineMessage } from "@/lib/lineNotify";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
}

const ID_MESSAGE = (userId: string) =>
  `あなたのLINEユーザーIDです。\n\n${userId}\n\nこれをコピーして、家計簿アプリの「設定」→「LINE通知」に貼り付けて保存してください。`;

/** LINE公式アカウントのWebhook。友だち追加・メッセージ送信のたびに、送信者へ自分のユーザーIDを案内する
 * （通知を受け取るための設定を、家族が自分で完結できるようにするため）。 */
export async function POST(req: Request) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  const bodyText = await req.text();

  if (secret) {
    const signature = req.headers.get("x-line-signature") ?? "";
    const expected = crypto.createHmac("sha256", secret).update(bodyText).digest("base64");
    if (signature !== expected) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(bodyText || "{}");
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  for (const event of payload.events ?? []) {
    const userId = event.source?.userId;
    if (!userId) continue;
    if (event.replyToken) {
      await replyLineMessage(event.replyToken, ID_MESSAGE(userId));
    } else {
      await sendLineMessage(userId, ID_MESSAGE(userId));
    }
  }

  return NextResponse.json({ ok: true });
}
