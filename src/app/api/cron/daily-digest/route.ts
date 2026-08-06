import { NextResponse } from "next/server";
import { todayStrJST, prevDayStr, addDaysStr, dayOfWeek } from "@/lib/date";
import { getAllProfiles, getLineRecipients } from "@/lib/profiles";
import { getDigest, upsertDigest } from "@/lib/digests";
import { gatherDigestData, hasAnyContent, buildDailyDigestPrompt, buildWeeklyDigestPrompt } from "@/lib/digestContext";
import { generateDigest } from "@/lib/anthropic";
import { getReminders } from "@/lib/reminders";
import { resolveNextDate } from "@/lib/reminderRecurrence";
import { getInventoryItems, lowStockItems as filterLowStock } from "@/lib/inventory";
import { sendLineMessage } from "@/lib/lineNotify";

/** 今日分のリマインダー・在庫切れをLINEで両ownerに知らせる（何もなければ送らない）。
 * 専用のcronは作らず、既存の毎日1回のこの枠に相乗りする（Vercelのcron本数制限を避けるため）。 */
async function sendLineDailyReminderDigest(): Promise<void> {
  const recipients = await getLineRecipients();
  if (recipients.length === 0) return;

  const today = todayStrJST();
  const [reminderRows, inventoryRows] = await Promise.all([getReminders(), getInventoryItems()]);

  const dueToday = reminderRows.filter((r) => r.active && resolveNextDate(r, today).next_date === today).map((r) => r.name);
  const lowStock = filterLowStock(inventoryRows).map((i) => i.name);
  if (dueToday.length === 0 && lowStock.length === 0) return;

  const lines = [`📋 ${today} の家計簿だより`];
  if (dueToday.length) lines.push("", "🔔 今日やること:", ...dueToday.map((n) => `・${n}`));
  if (lowStock.length) lines.push("", "📦 在庫が少ないもの:", ...lowStock.map((n) => `・${n}`));
  const message = lines.join("\n");

  await Promise.all(recipients.map((p) => sendLineMessage(p.line_user_id, message)));
}

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

  await sendLineDailyReminderDigest().catch((e) => console.error("sendLineDailyReminderDigest failed", e));

  return NextResponse.json({ today: todayJst, isMonday, results });
}
