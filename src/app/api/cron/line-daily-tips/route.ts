import { NextResponse } from "next/server";
import { todayStrJST, currentTimeBucketJST } from "@/lib/date";
import { TIP_DEFS, tipsDueFor, hasTipSent, generateAndRecordTip } from "@/lib/lineDailyTips";
import { getLineRecipients } from "@/lib/profiles";
import { sendLineMessage } from "@/lib/lineNotify";

/** GitHub Actionsから呼ばれる（設定は15分おきだが、実測では1日5〜6回・3〜6時間空くこともあり、
 * 発火間隔は保証されない）。06:00/09:00/12:00/15:00/18:00/21:00/23:00/23:30(JST)のうち、予定時刻を
 * 過ぎていてまだ送っていないものを都度追いつき送信する（1カテゴリ1日1回・冪等）。夜のコーナーは
 * 当日中の猶予が短いため、深夜（朝5時まで）なら前日分としても送る。onlyForSlugが設定されている
 * コーナー（例: 個人の体型に合わせたファッション提案）は、その本人にだけ送る。
 * ?force=<category>を付けると、時刻に関わらずそのカテゴリを対象に加える（動作確認・手動テスト用。
 * 1日1回の冪等性は変わらないので、翌回の定時配信と二重に送られることはない）。 */

/** AI生成（web検索つきの記事を含む）は既定の10秒では終わらないため上限を延ばす。 */
export const maxDuration = 60;

/** 1回の呼び出しで生成するコーナー数の上限。 */
const MAX_PER_RUN = 4;
/** これを過ぎたら新しい生成を始めない。関数の実行上限（maxDuration）で打ち切られると
 * 生成途中のものが無駄になるため、残りは次の呼び出しに回す。 */
const SOFT_DEADLINE_MS = 40_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const { searchParams } = new URL(req.url);
  const forceCategory = searchParams.get("force");

  const today = todayStrJST();
  const bucket = currentTimeBucketJST(15);
  const due = tipsDueFor(bucket, today);
  const forced = forceCategory ? TIP_DEFS.find((d) => d.category === forceCategory) : undefined;
  if (forced && !due.some((d) => d.def.category === forced.category)) due.push({ def: forced, date: today });

  const sent: string[] = [];
  const failed: string[] = [];
  let skippedForTime = 0;
  for (const { def, date } of due) {
    if (sent.length + failed.length >= MAX_PER_RUN || Date.now() - startedAt > SOFT_DEADLINE_MS) {
      skippedForTime++;
      continue;
    }
    if (await hasTipSent(def.category, date)) continue;
    try {
      const content = await generateAndRecordTip(def, date);
      const allRecipients = await getLineRecipients();
      const recipients = def.onlyForSlug ? allRecipients.filter((r) => r.slug === def.onlyForSlug) : allRecipients;
      // 前日分を追いつきで送る場合は、いつの分かが分かるように日付を添える。
      const label = date === today ? def.label : `${def.label}（${date.slice(5).replace("-", "/")}分）`;
      await Promise.all(recipients.map((r) => sendLineMessage(r.line_user_id, `${label}\n\n${content}`)));
      sent.push(date === today ? def.category : `${def.category}@${date}`);
    } catch (e) {
      // 生成に失敗したコーナーは記録していないので、次の呼び出しで作り直される。
      console.error(`line daily tip failed: ${def.category} (${date})`, e);
      failed.push(def.category);
    }
  }

  return NextResponse.json({ bucket, sent, failed, skippedForTime });
}
