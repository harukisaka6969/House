import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeftAt, clearLeft } from "@/lib/homePresence";
import { sendCommand, switchBotAvailable } from "@/lib/switchbot";
import { runArrivalAutomation } from "@/lib/awayShutoffJob";

const bodySchema = z.object({ token: z.string(), slug: z.string().min(1).max(40), leftAt: z.string().optional() });
const AWAY_THRESHOLD_MS = 15 * 60 * 1000;

/** 帰宅時の点灯で家電に1台ずつコマンドを送るため、既定の10秒より長く待つ。 */
export const maxDuration = 60;

/** iOSショートカットの「到着」オートメーションから呼ばれる想定のWebhook。15分以上外出していた場合のみ、
 * 設定済みの鍵デバイスを解錠する（無条件解錠を避けるための最低限の安全策）。家が空のところへ帰ってきた場合は、
 * Dining room の照明を点ける（日の入り±10分はSwitchBot側の自動点灯に任せる）。
 * 外出時刻は、不安定になりがちな「外出」側の通信を避けるため、ショートカット側でローカル保存した値を
 * この到着リクエストのbodyに`leftAt`として乗せて送ってもらう想定。省略された場合のみ、旧来のサーバー側
 * 記録（/api/geofence/leave経由）にフォールバックする。 */
export async function POST(req: Request) {
  try {
    const secret = process.env.GEOFENCE_TOKEN;
    const { token, slug, leftAt: leftAtParam } = bodySchema.parse(await req.json());
    if (!secret || token !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    let leftAt: string | null;
    if (leftAtParam) {
      const parsed = new Date(leftAtParam);
      if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "invalid leftAt" }, { status: 400 });
      leftAt = parsed.toISOString();
      await clearLeft(slug);
    } else {
      leftAt = await getLeftAt(slug);
      await clearLeft(slug);
    }

    if (!leftAt) return NextResponse.json({ ok: true, unlocked: false, reason: "no leave record" });

    // 玄関の解錠を先に済ませる（家電の操作で待たせないため）。
    const awayMs = Date.now() - new Date(leftAt).getTime();
    const deviceId = process.env.SWITCHBOT_HOME_LOCK_DEVICE_ID;
    let unlocked = false;
    let reason: string | undefined;
    if (awayMs < AWAY_THRESHOLD_MS) reason = "away time too short";
    else if (!switchBotAvailable() || !deviceId) reason = "switchbot not configured";
    else {
      // 解錠・施錠のLINE通知は送らない（不要との要望で停止。結果はレスポンスで返す）。
      await sendCommand(deviceId, "unlock");
      unlocked = true;
    }

    // 家が空のところへ帰ってきたら、Dining room の照明を点ける（短い外出でも、外出時に常夜灯にしているので戻す）。
    const lights = await runArrivalAutomation(slug).catch((e) => {
      console.error("arrival automation failed", e);
      return { ran: false as const, reason: "error" };
    });

    return NextResponse.json({ ok: true, unlocked, reason, lights });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    console.error("geofence arrive failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
