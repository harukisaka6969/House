import { NextResponse } from "next/server";
import { z } from "zod";
import { getPresence, clearLeft } from "@/lib/homePresence";
import { effectiveLeftAt, decideUnlock } from "@/lib/awayShutoff";
import { sendCommand, switchBotAvailable } from "@/lib/switchbot";
import { runArrivalAutomation, notifyPresence, othersAwayNow } from "@/lib/awayShutoffJob";

const bodySchema = z.object({ token: z.string(), slug: z.string().min(1).max(40), leftAt: z.string().optional() });

/** 帰宅時の点灯で家電に1台ずつコマンドを送るため、既定の10秒より長く待つ。 */
export const maxDuration = 60;

/** iOSショートカットの「到着」オートメーションから呼ばれる想定のWebhook。
 * 解錠: 90秒以上外出していたとき。出発の記録が無いときは、家に誰かいれば解錠する（decideUnlock）。
 * 照明: 家が空のところへ帰ってきた場合は、Dining room の照明を点ける（日の入り±10分はSwitchBot側の自動点灯に任せる）。
 * 外出時刻は、不安定になりがちな「出発」側の通信を避けるため、ショートカット側でローカル保存した値を
 * この到着リクエストのbodyに`leftAt`として乗せて送ってもらう。サーバー側の記録（/api/geofence/leave）とあわせ、
 * 前回の到着より後のものだけを使う（出発・到着の記録が抜けても、次の回から正しく戻るように）。 */
export async function POST(req: Request) {
  try {
    const secret = process.env.GEOFENCE_TOKEN;
    const { token, slug, leftAt: leftAtParam } = bodySchema.parse(await req.json());
    if (!secret || token !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const presence = await getPresence(slug);
    const leftAt = effectiveLeftAt(leftAtParam, presence.left_at, presence.arrived_at);
    await clearLeft(slug);

    // 玄関の解錠を先に済ませる（家電の操作で待たせないため）。
    const someoneElseHome = !(await othersAwayNow(slug));
    const decision = decideUnlock(leftAt, someoneElseHome, new Date());
    const deviceId = process.env.SWITCHBOT_HOME_LOCK_DEVICE_ID;
    let unlocked = false;
    let reason = decision.reason;
    if (decision.unlock) {
      if (!switchBotAvailable() || !deviceId) reason = "switchbot not configured";
      else {
        // 解錠・施錠の世帯全員へのLINE通知は送らない（本人への「いってらっしゃい／おかえり」だけ送る）。
        await sendCommand(deviceId, "unlock");
        unlocked = true;
      }
    }

    // 家が空のところへ帰ってきたら、Dining room の照明を点ける（外出時に常夜灯にしているので戻す）。
    const lights = await runArrivalAutomation(slug).catch((e) => {
      console.error("arrival automation failed", e);
      return { ran: false as const, reason: "error" };
    });

    // 出発・帰宅したその人だけに「いってらっしゃい」「おかえり」と家電の結果を送る（世帯全員には送らない）。
    await notifyPresence(slug, "arrive", lights);

    return NextResponse.json({ ok: true, unlocked, reason, lights });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    console.error("geofence arrive failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

