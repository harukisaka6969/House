import { NextResponse } from "next/server";
import { todayStrJST, prevDayStr, addDaysStr, dayOfWeek } from "@/lib/date";
import { getAllProfiles } from "@/lib/profiles";
import { getDigest, upsertDigest } from "@/lib/digests";
import { gatherDigestData, hasAnyContent, buildDailyDigestPrompt, buildWeeklyDigestPrompt } from "@/lib/digestContext";
import { generateDigest } from "@/lib/anthropic";

const NO_CONTENT_MESSAGE = "この日は記録がほとんどありませんでした。次はちょっとしたことでも日記や記録を残してみましょう。";

/** Vercel Cronから毎日呼ばれる。前日分の日次ダイジェストを（owner毎に）生成し、
 * 月曜日であれば先週分の週次ダイジェストも生成する（どちらも既に存在すればスキップ、冪等）。 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const todayJst = todayStrJST();
  const targetDate = prevDayStr(todayJst);
  const isMonday = dayOfWeek(todayJst) === 1;

  const profiles = await getAllProfiles();
  const owners = profiles.filter((p) => p.role === "owner");

  const results: { owner: string; kind: string; periodKey: string; action: string }[] = [];

  for (const owner of owners) {
    const existingDaily = await getDigest(owner.id, "daily", targetDate);
    if (existingDaily) {
      results.push({ owner: owner.name, kind: "daily", periodKey: targetDate, action: "skipped(exists)" });
    } else {
      const data = await gatherDigestData(owner.id, targetDate, todayJst);
      const body = hasAnyContent(data) ? await generateDigest(buildDailyDigestPrompt(owner.name, targetDate, data), 700) : NO_CONTENT_MESSAGE;
      await upsertDigest(owner.id, "daily", targetDate, body);
      results.push({ owner: owner.name, kind: "daily", periodKey: targetDate, action: "created" });
    }

    if (isMonday) {
      const weekStart = addDaysStr(todayJst, -7);
      const existingWeekly = await getDigest(owner.id, "weekly", weekStart);
      if (existingWeekly) {
        results.push({ owner: owner.name, kind: "weekly", periodKey: weekStart, action: "skipped(exists)" });
      } else {
        const data = await gatherDigestData(owner.id, weekStart, todayJst);
        const body = hasAnyContent(data)
          ? await generateDigest(buildWeeklyDigestPrompt(owner.name, weekStart, prevDayStr(todayJst), data), 1100)
          : NO_CONTENT_MESSAGE;
        await upsertDigest(owner.id, "weekly", weekStart, body);
        results.push({ owner: owner.name, kind: "weekly", periodKey: weekStart, action: "created" });
      }
    }
  }

  return NextResponse.json({ today: todayJst, isMonday, results });
}
