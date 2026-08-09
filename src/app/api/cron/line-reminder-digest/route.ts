import { NextResponse } from "next/server";
import { todayStrJST, currentTimeBucketJST } from "@/lib/date";
import { getLineReminderRecipientsForTime, markLineReminderSent, getLineRecipients } from "@/lib/profiles";
import { buildReminderDigestMessage } from "@/lib/lineReminderDigest";
import { getRemindersDueForNotifyTime, markReminderNotified } from "@/lib/reminders";
import { sendLineMessage } from "@/lib/lineNotify";

/** 15分おきの外部スケジューラ（GitHub Actionsなど）から呼ばれる。今の時刻（JST・15分刻み）に合わせて、
 * ① 個別に通知時刻を設定しているリマインダーをそれぞれ単独で通知し、
 * ② 全体ダイジェストの配信時刻を設定しているownerには、今日分のリマインダー・在庫切れをまとめて通知する（どちらも1日1回まで）。 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = todayStrJST();
  const bucket = currentTimeBucketJST();

  const dueReminders = await getRemindersDueForNotifyTime(bucket, today);
  if (dueReminders.length > 0) {
    const recipients = await getLineRecipients();
    for (const r of dueReminders) {
      const message = `🔔 ${r.name}${r.memo ? `\n${r.memo}` : ""}\nLINEで「完了」と送ると完了にできるよ。`;
      await Promise.all(recipients.map((p) => sendLineMessage(p.line_user_id, message)));
      await markReminderNotified(r.id, today);
    }
  }

  const digestRecipients = await getLineReminderRecipientsForTime(bucket, today);
  let digestSent = 0;
  if (digestRecipients.length > 0) {
    // 日記からの「N年前の今日」は本人のみ閲覧可のため、宛先ごとに内容を作って個別送信する。
    for (const r of digestRecipients) {
      const message = await buildReminderDigestMessage(r.id);
      if (message) {
        await sendLineMessage(r.line_user_id, message);
        digestSent++;
      }
    }
    await Promise.all(digestRecipients.map((r) => markLineReminderSent(r.id, today)));
  }

  return NextResponse.json({ bucket, remindersNotified: dueReminders.length, digestSent });
}
