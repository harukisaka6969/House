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

/** 文字列から{年?, 月, 日}を取り出す。年が書かれていなければyはnull。 */
function parseParts(raw: string): { y: number | null; m: number; d: number } | null {
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
    return { y: base + Number(era[2]), m: Number(era[3]), d: Number(era[4]) };
  }
  // 西暦4桁: 2026-10-24 / 2026/10/24 / 2026.10.24 / 2026年10月24日 / 20261024
  const full = s.match(/(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/) ?? s.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (full) return { y: Number(full[1]), m: Number(full[2]), d: Number(full[3]) };
  // 西暦2桁: 26/10/24 / 26.10.24 / 26年10月24日
  const short = s.match(/(?<!\d)(\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})(?!\d)/);
  if (short) return { y: 2000 + Number(short[1]), m: Number(short[2]), d: Number(short[3]) };
  // 年なし: 10月24日 / 10/24
  const md = s.match(/(?<!\d)(\d{1,2})\s*[月/]\s*(\d{1,2})(?!\d)/);
  if (md) return { y: null, m: Number(md[1]), d: Number(md[2]) };
  return null;
}

/** レシートから読み取った日付表記をYYYY-MM-DDに正規化する。今日(today, YYYY-MM-DD)を基準に、
 * 年の書かれていない日付は「今日以前で一番近い年」に補い、明らかな未来日（読み間違い）や
 * 読み取れないものはnullにする（呼び出し側で当日扱いにする）。 */
export function normalizeReceiptDate(raw: unknown, today: string): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parts = parseParts(raw);
  if (!parts) return null;
  // タイムゾーン差や深夜の買い物で1日ずれる分は許容する
  const latest = addDaysStr(today, 1);
  const todayYear = Number(today.slice(0, 4));
  if (parts.y === null) {
    const thisYear = ymd(todayYear, parts.m, parts.d);
    if (thisYear && thisYear <= latest) return thisYear;
    return ymd(todayYear - 1, parts.m, parts.d);
  }
  const date = ymd(parts.y, parts.m, parts.d);
  if (!date || date > latest || parts.y < 2000) return null;
  return date;
}
