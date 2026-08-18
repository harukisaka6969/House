const JST = "Asia/Tokyo";

/** Today's date as YYYY-MM-DD in JST, regardless of server timezone. */
export function todayStrJST(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/** 購入・食事の記録用の「今日」(YYYY-MM-DD, JST)。1日を午前3:30始まり・翌午前3:29:59終わりとみなし、
 * 深夜0:00〜3:29はまだ前日の続きとして扱う。日付の自動割り当てが必要な箇所（未入力時のデフォルト、
 * LINEでの記録、相対日付の解決基準など）で、購入品・食事に限りtodayStrJSTの代わりに使う。 */
export function businessDateJST(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const beforeCutoff = hour < 3 || (hour === 3 && minute < 30);
  return beforeCutoff ? prevDayStr(dateStr) : dateStr;
}

/** 現在時刻をJSTの"HH:MM"で返し、分は15分刻みに切り捨てる（LINEリマインダー配信時刻とのマッチング用）。 */
export function currentTimeBucketJST(stepMinutes = 15): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: JST,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === "hour")!.value;
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  const bucketed = Math.floor(minute / stepMinutes) * stepMinutes;
  return `${hour}:${String(bucketed).padStart(2, "0")}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 家計上の「月」は25日始まり・翌月24日締め。ラベルは開始月を使う（例: 7/25〜8/24 は「2026-07」）。
 * dateStr（YYYY-MM-DD）が属する月ラベルを返す。 */
export function periodKeyOfDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const calMonth = `${y}-${String(m).padStart(2, "0")}`;
  return d >= 25 ? calMonth : shiftMonth(calMonth, -1);
}

export function nowMonthKeyJST(): string {
  return periodKeyOfDate(todayStrJST());
}

/** 月ラベル(monthKey)が表す25日始まり・翌月24日締め期間の [from, toExclusive) を返す。 */
export function periodRange(monthKey: string): { from: string; toExclusive: string } {
  return { from: `${monthKey}-25`, toExclusive: `${shiftMonth(monthKey, 1)}-25` };
}

/** 月ラベル(monthKey)が表す期間の末日（含む）。常に翌暦月の24日。 */
export function periodEndInclusive(monthKey: string): string {
  return `${shiftMonth(monthKey, 1)}-24`;
}

export function isValidMonthKey(key: string): boolean {
  return /^\d{4}-\d{2}$/.test(key);
}

export function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + "T00:00:00Z").getTime());
}

/** dateStr（YYYY-MM-DD）の翌日をYYYY-MM-DDで返す。日付範囲クエリの排他的上限に使う。 */
export function nextDayStr(dateStr: string): string {
  return addDaysStr(dateStr, 1);
}

/** dateStr（YYYY-MM-DD）のdays日後（負数で前）をYYYY-MM-DDで返す。 */
export function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** dateStr（YYYY-MM-DD）の前日をYYYY-MM-DDで返す。 */
export function prevDayStr(dateStr: string): string {
  return addDaysStr(dateStr, -1);
}

/** dateStr（YYYY-MM-DD）の曜日（0=日〜6=土）。 */
export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
