import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeftAt, clearLeft } from "@/lib/homePresence";
import { sendCommand, switchBotAvailable } from "@/lib/switchbot";
import { getLineRecipients, findProfileBySlug } from "@/lib/profiles";
import { sendLineMessage } from "@/lib/lineNotify";

const bodySchema = z.object({ token: z.string(), slug: z.string().min(1).max(40), leftAt: z.string().optional() });
const AWAY_THRESHOLD_MS = 15 * 60 * 1000;

/** iOSショートカットの「到着」オートメーションから呼ばれる想定のWebhook。15分以上外出していた場合のみ、
 * 設定済みの鍵デバイスを解錠し、念のため世帯のLINEに通知する（無条件解錠を避けるための最低限の安全策）。
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

    const awayMs = Date.now() - new Date(leftAt).getTime();
    if (awayMs < AWAY_THRESHOLD_MS) return NextResponse.json({ ok: true, unlocked: false, reason: "away time too short" });

    const deviceId = process.env.SWITCHBOT_HOME_LOCK_DEVICE_ID;
    if (!switchBotAvailable() || !deviceId) return NextResponse.json({ ok: true, unlocked: false, reason: "switchbot not configured" });

    await sendCommand(deviceId, "unlock");

    const [profile, recipients] = await Promise.all([findProfileBySlug(slug), getLineRecipients()]);
    const message = `🔓 ${profile?.name ?? slug}が帰宅したので、玄関を自動解錠しました。`;
    await Promise.all(recipients.map((r) => sendLineMessage(r.line_user_id, message)));

    return NextResponse.json({ ok: true, unlocked: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    console.error("geofence arrive failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
