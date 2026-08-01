import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { todayStrJST, prevDayStr, addDaysStr, dayOfWeek } from "@/lib/date";
import { getDigest, getLatestDigest, upsertDigest } from "@/lib/digests";
import { gatherDigestData, hasAnyContent, buildDailyDigestPrompt, buildWeeklyDigestPrompt } from "@/lib/digestContext";
import { generateDigest } from "@/lib/anthropic";
import { getProfileById } from "@/lib/pinAuth";
import type { DigestKind } from "@/lib/types";

const NO_CONTENT_MESSAGE = "この日は記録がほとんどありませんでした。次はちょっとしたことでも日記や記録を残してみましょう。";

/** 直近の完了済み対象期間: daily=前日、weekly=直近の月曜始まりで既に終わった週。 */
function currentTargets(): { dailyDate: string; weeklyStart: string; weeklyEndExclusive: string } {
  const today = todayStrJST();
  const dailyDate = prevDayStr(today);
  const dow = dayOfWeek(today); // 0=日..6=土, 1=月
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = addDaysStr(today, -daysSinceMonday);
  const weeklyStart = addDaysStr(thisMonday, -7);
  return { dailyDate, weeklyStart, weeklyEndExclusive: thisMonday };
}

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const { dailyDate } = currentTargets();
    const [daily, weekly] = await Promise.all([getDigest(session.profile_id, "daily", dailyDate), getLatestDigest(session.profile_id, "weekly")]);
    return NextResponse.json({
      daily: daily ? { kind: "daily", period_key: daily.period_key, body: daily.body, created_at: daily.created_at } : null,
      weekly: weekly ? { kind: "weekly", period_key: weekly.period_key, body: weekly.body, created_at: weekly.created_at } : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({ kind: z.enum(["daily", "weekly"]) });

/** 手動での再生成（まだcronが実行されていない・作り直したい場合用）。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const limited = rateLimit(`digest:${session.profile_id}`, 10, 60 * 60 * 1000);
    if (!limited.ok) throw new ApiError(429, "ダイジェストの生成回数上限に達しました。しばらくしてから再試行してください。");

    const { kind } = bodySchema.parse(await req.json());
    const profile = await getProfileById(session.profile_id);
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { dailyDate, weeklyStart, weeklyEndExclusive } = currentTargets();
    const periodKey: string = kind === "daily" ? dailyDate : weeklyStart;
    const [fromDate, toExclusive] = kind === "daily" ? [dailyDate, todayStrJST()] : [weeklyStart, weeklyEndExclusive];

    const data = await gatherDigestData(session.profile_id, fromDate, toExclusive);
    const body = hasAnyContent(data)
      ? await generateDigest(
          kind === "daily" ? buildDailyDigestPrompt(profile.name, dailyDate, data) : buildWeeklyDigestPrompt(profile.name, weeklyStart, prevDayStr(weeklyEndExclusive), data),
          kind === "daily" ? 700 : 1100
        )
      : NO_CONTENT_MESSAGE;

    const saved = await upsertDigest(session.profile_id, kind as DigestKind, periodKey, body);
    return NextResponse.json({ digest: { kind, period_key: saved.period_key, body: saved.body, created_at: saved.created_at } });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
