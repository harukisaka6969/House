import { NextResponse } from "next/server";
import { todayStrJST, currentTimeBucketJST } from "@/lib/date";
import { TIP_DEFS, tipsDueForTime, hasTipSentToday, generateAndRecordTip } from "@/lib/lineDailyTips";
import { getLineRecipients } from "@/lib/profiles";
import { sendLineMessage } from "@/lib/lineNotify";

/** GitHub Actionsからおおよそ15分おきに呼ばれる（実際の発火間隔は保証されない）。06:00/09:00/12:00/15:00/
 * 18:00/21:00/23:00/23:30(JST)のうち、予定時刻を過ぎていて今日まだ送っていないものを都度追いつき送信する
 * （1カテゴリ1日1回・冪等）。onlyForSlugが設定されているコーナー（例: 個人の体型に合わせたファッション
 * 提案）は、その本人にだけ送る。?force=<category>を付けると、時刻に関わらずそのカテゴリを対象に加える
 * （動作確認・手動テスト用。1日1回の冪等性は変わらないので、翌回の定時配信と二重に送られることはない）。 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const forceCategory = searchParams.get("force");

  const today = todayStrJST();
  const bucket = currentTimeBucketJST(15);
  const due = tipsDueForTime(bucket);
  const forced = forceCategory ? TIP_DEFS.find((d) => d.category === forceCategory) : undefined;
  if (forced && !due.includes(forced)) due.push(forced);

  const sent: string[] = [];
  for (const def of due) {
    if (await hasTipSentToday(def.category, today)) continue;
    try {
      const content = await generateAndRecordTip(def, today);
      const allRecipients = await getLineRecipients();
      const recipients = def.onlyForSlug ? allRecipients.filter((r) => r.slug === def.onlyForSlug) : allRecipients;
      const message = `${def.label}\n\n${content}`;
      await Promise.all(recipients.map((r) => sendLineMessage(r.line_user_id, message)));
      sent.push(def.category);
    } catch (e) {
      console.error(`line daily tip failed: ${def.category}`, e);
    }
  }

  return NextResponse.json({ bucket, sent });
}
