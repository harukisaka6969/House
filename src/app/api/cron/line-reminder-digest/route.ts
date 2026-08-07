import { NextResponse } from "next/server";
import { todayStrJST, currentTimeBucketJST } from "@/lib/date";
import { getLineReminderRecipientsForTime, markLineReminderSent } from "@/lib/profiles";
import { buildReminderDigestMessage } from "@/lib/lineReminderDigest";
import { sendLineMessage } from "@/lib/lineNotify";

/** 15分おきの外部スケジューラ（GitHub Actionsなど）から呼ばれる。今の時刻（JST・15分刻み）を
 * 配信時刻に設定しているownerだけに、今日分のリマインダー・在庫切れダイジェストを送る（1日1回まで）。 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = todayStrJST();
  const bucket = currentTimeBucketJST();
  const recipients = await getLineReminderRecipientsForTime(bucket, today);
  if (recipients.length === 0) return NextResponse.json({ bucket, sent: 0 });

  const message = await buildReminderDigestMessage();
  if (!message) {
    await Promise.all(recipients.map((r) => markLineReminderSent(r.id, today)));
    return NextResponse.json({ bucket, sent: 0, reason: "nothing to report" });
  }

  await Promise.all(
    recipients.map(async (r) => {
      await sendLineMessage(r.line_user_id, message);
      await markLineReminderSent(r.id, today);
    })
  );

  return NextResponse.json({ bucket, sent: recipients.length });
}
