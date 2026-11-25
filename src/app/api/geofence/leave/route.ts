import { NextResponse } from "next/server";
import { z } from "zod";
import { markLeft } from "@/lib/homePresence";
import { sendCommand, switchBotAvailable } from "@/lib/switchbot";
import { runAwayShutoffIfEveryoneLeft } from "@/lib/awayShutoffJob";

const bodySchema = z.object({ token: z.string(), slug: z.string().min(1).max(40) });

/** 消灯ジョブで家電に1台ずつコマンドを送るため、既定の10秒より長く待つ。 */
export const maxDuration = 60;

/** iOSショートカットの「出発」オートメーションから呼ばれる想定のWebhook。外出時刻を記録した上で、
 * 設定済みの鍵デバイスを即座に施錠する。誤って施錠しても解錠よりリスクが低いため、到着時の自動解錠のような
 * 「○分以上」の待機は設けない。この出発で家に誰もいなくなった場合は、Dining room 以外の電気・家電も消す。 */
export async function POST(req: Request) {
  try {
    const secret = process.env.GEOFENCE_TOKEN;
    const { token, slug } = bodySchema.parse(await req.json());
    if (!secret || token !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    await markLeft(slug);

    const deviceId = process.env.SWITCHBOT_HOME_LOCK_DEVICE_ID;
    let locked = false;
    if (switchBotAvailable() && deviceId) {
      // 解錠・施錠のLINE通知は送らない（不要との要望で停止。結果はレスポンスで返す）。
      await sendCommand(deviceId, "lock");
      locked = true;
    }

    // この出発で家に誰もいなくなったら、Dining room 以外の電気・家電を消す（鍵とは独立に判定）。
    const shutoff = await runAwayShutoffIfEveryoneLeft().catch((e) => {
      console.error("away shutoff failed", e);
      return { ran: false as const, reason: "error" };
    });

    return NextResponse.json({ ok: true, locked, shutoff });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    console.error("geofence leave failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
