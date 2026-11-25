import { NextResponse } from "next/server";
import { z } from "zod";
import { markLeft } from "@/lib/homePresence";
import { sendCommand, switchBotAvailable } from "@/lib/switchbot";

const bodySchema = z.object({ token: z.string(), slug: z.string().min(1).max(40) });

/** iOSショートカットの「出発」オートメーションから呼ばれる想定のWebhook。外出時刻を記録した上で、
 * 設定済みの鍵デバイスを即座に施錠する。誤って施錠しても解錠より
 * リスクが低いため、到着時の自動解錠のような「○分以上」の待機は設けない。 */
export async function POST(req: Request) {
  try {
    const secret = process.env.GEOFENCE_TOKEN;
    const { token, slug } = bodySchema.parse(await req.json());
    if (!secret || token !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    await markLeft(slug);

    const deviceId = process.env.SWITCHBOT_HOME_LOCK_DEVICE_ID;
    if (!switchBotAvailable() || !deviceId) return NextResponse.json({ ok: true, locked: false, reason: "switchbot not configured" });

    // 解錠・施錠のLINE通知は送らない（不要との要望で停止。結果はレスポンスで返す）。
    await sendCommand(deviceId, "lock");

    return NextResponse.json({ ok: true, locked: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    console.error("geofence leave failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
