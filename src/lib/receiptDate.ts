import { addDaysStr } from "./date";

/** 年月日が実在する日付ならYYYY-MM-DDを返す（2/30などはnull）。 */
function ymd(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 和暦の元号 → 西暦の元年-1。 */
const ERA_BASE: Record<string, number> = { 令和: 2018, R: 2018, 平成: 1988, H: 1988 };

/** 文字列から{年?, 月, 日}を取り出す。年が書かれていなければyはnull。
 * ambiguousは「05/10/2026」のように月/日と日/月のどちらとも読める海外式の並び。 */
function parseParts(raw: string): { y: number | null; m: number; d: number; ambiguous: boolean } | null {
  // 全角数字・記号を半角に寄せる
  const s = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[／．－]/g, (c) => ({ "／": "/", "．": ".", "－": "-" })[c] as string)
    .replace(/元年/g, "1年")
    .trim();

  // 和暦: 令和7年10月24日 / R7.10.24 / R07/10/24 / H31.4.30
  const era = s.match(/(令和|平成|R|H)\s*(\d{1,2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/i);
  if (era) {
    const base = ERA_BASE[era[1].toUpperCase()] ?? ERA_BASE[era[1]];
    return { y: base + Number(era[2]), m: Number(era[3]), d: Number(era[4]), ambiguous: false };
  }
  // 西暦4桁: 2026-10-24 / 2026/10/24 / 2026.10.24 / 2026年10月24日 / 20261024
  const full = s.match(/(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/) ?? s.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (full) return { y: Number(full[1]), m: Number(full[2]), d: Number(full[3]), ambiguous: false };
  // 海外式（年が末尾）: 05/10/2026（日/月 か 月/日）
  const tail = s.match(/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/);
  if (tail) return { y: Number(tail[3]), m: Number(tail[1]), d: Number(tail[2]), ambiguous: true };
  // 西暦2桁: 26/10/24 / 26.10.24 / 26年10月24日
  const short = s.match(/(?<!\d)(\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})(?!\d)/);
  if (short) return { y: 2000 + Number(short[1]), m: Number(short[2]), d: Number(short[3]), ambiguous: false };
  // 年なし: 10月24日 / 10/24
  const md = s.match(/(?<!\d)(\d{1,2})\s*[月/]\s*(\d{1,2})(?!\d)/);
  if (md) return { y: null, m: Number(md[1]), d: Number(md[2]), ambiguous: false };
  return null;
}

/** これより古い日付は、年の読み間違い（2026→2020など）を疑う。 */
const MAX_AGE_DAYS = 365;

/** レシートから読み取った日付表記をYYYY-MM-DDに正規化する。今日(today, YYYY-MM-DD)を基準に、
 * - 年の書かれていない日付は「今日以前で一番近い年」に補う
 * - 1年以上前・未来の日付は年の読み間違いとみなし、同じ月日の今年に直す（今年だと未来になるならnull）
 *   （AIが2026年のレシートを2020年や2022年と読み、ダッシュボードの表示期間外に入ってしまうのを防ぐ）
 * - 「05/10/2026」のような日/月とも月/日とも読める海外式は、今日以前で今日に近いほうを採る
 * どう直しても妥当な日付にならなければnull（呼び出し側で当日扱いにする）。 */
export function normalizeReceiptDate(raw: unknown, today: string): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parts = parseParts(raw);
  if (!parts) return null;
  // タイムゾーン差や深夜の買い物で1日ずれる分は許容する
  const latest = addDaysStr(today, 1);
  const oldest = addDaysStr(today, -MAX_AGE_DAYS);
  const todayYear = Number(today.slice(0, 4));
  const plausible = (date: string | null): date is string => !!date && date <= latest && date >= oldest;
  // 候補の中で、今日以前で一番今日に近いものを採る
  const pick = (cands: (string | null)[]) => cands.filter(plausible).sort().pop() ?? null;
  const orders: [number, number][] = parts.ambiguous ? [[parts.m, parts.d], [parts.d, parts.m]] : [[parts.m, parts.d]];

  if (parts.y === null) return pick(orders.flatMap(([m, d]) => [ymd(todayYear, m, d), ymd(todayYear - 1, m, d)]));
  const asWritten = pick(orders.map(([m, d]) => ymd(parts.y as number, m, d)));
  if (asWritten) return asWritten;
  // 年を読み間違えたとみなして今年に直す。去年に寄せると、ずれた日付のままダッシュボードの
  // 表示期間外に入りかねないので、今年にならなければ諦める（当日扱い）。
  return pick(orders.map(([m, d]) => ymd(todayYear, m, d)));
}
