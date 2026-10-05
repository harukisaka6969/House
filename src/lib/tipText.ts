/**
 * 生活tips（LINEに1日数回送る記事）の本文抽出・検品（純粋関数・テストから直接読める）。
 *
 * AIにはweb検索などを使わせているため、本文の前後に「検索結果が集まりました」のような
 * 独り言が混ざることがある。そのため本文は<output>タグで囲ませて抽出し、さらに
 * 「抽出できたものが本当に記事になっているか」をここで検品する。
 * 検品に落ちたものは送らず記録もしないことで、同じ日のうちに再生成される（追いつき配信）。
 */

import { prevDayStr } from "./date";

/** 日付をまたいで追いつき配信できる時刻の下限。これ以降に予定されているコーナーは、
 * 日付が変わった後でも「前日分」として送れるようにする（23:00・23:30のコーナーは
 * 当日中の猶予が30分〜1時間しかなく、cronの起動が飛ぶとその日は送られないまま終わるため）。 */
export const CARRYOVER_FROM = "18:00";
/** 前日分の追いつき配信を認める時刻の上限（これを過ぎたら前日分はあきらめる）。 */
export const CARRYOVER_UNTIL = "05:00";

/**
 * 今の時刻（JSTの"HH:MM"）で送るべきコーナーと、その対象日を返す。
 * ・予定時刻を過ぎていて今日まだ送っていないもの → 当日分
 * ・深夜（CARRYOVER_UNTILより前）なら、まだ予定時刻が来ていない夜のコーナー → 前日分
 *   （前日の夜に起動が飛んで送れなかった分の救済。古い方を先に返す）
 * 実際に送るかは呼び出し側のhasTipSent（カテゴリ＋日付）が最終判定する。
 */
export function selectDueTips<T extends { time: string }>(defs: T[], nowHhmm: string, today: string): { def: T; date: string }[] {
  const dueToday = defs.filter((d) => d.time <= nowHhmm).map((def) => ({ def, date: today }));
  if (nowHhmm >= CARRYOVER_UNTIL) return dueToday;
  const yesterday = prevDayStr(today);
  const carried = defs.filter((d) => d.time >= CARRYOVER_FROM && d.time > nowHhmm).map((def) => ({ def, date: yesterday }));
  return [...carried, ...dueToday];
}

export function extractTag(text: string, tag: string): string {
  const match = (text ?? "").match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return (match ? match[1] : "").trim();
}

/** <output>本文を取り出す。万一トークン上限で応答が</output>閉じタグの手前で切れてしまった場合でも、
 * 生の<output>タグをそのままLINEに表示してしまわないよう、開始タグの直後から末尾までを使う。 */
export function extractOutputContent(raw: string): string {
  const closed = extractTag(raw, "output");
  if (closed) return closed;
  const text = (raw ?? "").trim();
  const openIdx = text.indexOf("<output>");
  if (openIdx !== -1) return text.slice(openIdx + "<output>".length).trim();
  return text;
}

/** 記事として送れる中身かどうか。
 * ・短すぎるもの（生成が途中で止まった、タグだけ返ってきた等）
 * ・タグが残っているもの（抽出に失敗している）
 * ・日本語がほとんど無いもの（"Now I have enough material to write the digest." のような
 *   検索中の独り言がそのまま返ってきたケース。実際にこれがLINEに送られていた）
 * を弾く。 */
export function isUsableTipContent(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 30) return false;
  if (/<\/?(?:output|summary)>/.test(t)) return false;
  const japanese = (t.match(/[ぁ-んァ-ヶ一-龥]/g) ?? []).length;
  return japanese >= t.length * 0.2;
}
