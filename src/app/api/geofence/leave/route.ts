import { NextResponse } from "next/server";
import { z } from "zod";
import { markLeft } from "@/lib/homePresence";
import { sendCommand, switchBotAvailable } from "@/lib/switchbot";
import { runDepartureAutomation, notifyPresence } from "@/lib/awayShutoffJob";

const bodySchema = z.object({ token: z.string(), slug: z.string().min(1).max(40) });

/** 消灯ジョブで家電に1台ずつコマンドを送るため、既定の10秒より長く待つ。 */
export const maxDuration = 60;

/** iOSショートカットの「出発」オートメーションから呼ばれる想定のWebhook。外出時刻を記録した上で、
 * 設定済みの鍵デバイスを即座に施錠する。誤って施錠しても解錠よりリスクが低いため、到着時の自動解錠のような
 * 「○分以上」の待機は設けない。この出発で家に誰もいなくなった場合は、照明を常夜灯に、照明以外の電気・家電を
 * オフにする（Dining room は照明だけ）。 */
export async function POST(req: Request) {
  try {
    const secret = process.env.GEOFENCE_TOKEN;
    const { token, slug } = bodySchema.parse(await req.json());
    if (!secret || token !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    await markLeft(slug);

    const deviceId = process.env.SWITCHBOT_HOME_LOCK_DEVICE_ID;
    let locked = false;
    if (switchBotAvailable() && deviceId) {
      // 解錠・施錠の世帯全員へのLINE通知は送らない（本人への「いってらっしゃい／おかえり」だけ送る）。
      await sendCommand(deviceId, "lock");
      locked = true;
    }

    // この出発で家に誰もいなくなったら、照明を常夜灯に・照明以外をオフにする（鍵とは独立に判定）。
    const shutoff = await runDepartureAutomation(slug).catch((e) => {
      console.error("departure automation failed", e);
      return { ran: false as const, reason: "error" };
    });

    // 出発・帰宅したその人だけに「いってらっしゃい」「おかえり」と家電の結果を送る（世帯全員には送らない）。
    await notifyPresence(slug, "leave", shutoff);

    return NextResponse.json({ ok: true, locked, shutoff });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    console.error("geofence leave failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

