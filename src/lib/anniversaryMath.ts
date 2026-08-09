/** 記念日まわりの純粋な日付計算。DB/AI依存なしでテストできるよう anniversaries.ts から分離。 */

export interface AnniversaryLike {
  name: string;
  date: string; // "YYYY-MM-DD"
}

function monthDay(dateStr: string): string {
  return dateStr.slice(5); // "MM-DD"
}

function yearOf(dateStr: string): number {
  return Number(dateStr.slice(0, 4));
}

export function yearsSince(originDateStr: string, todayStr: string): number {
  return yearOf(todayStr) - yearOf(originDateStr);
}

export interface AnniversaryHit {
  name: string;
  years: number;
  text: string;
}

function anniversaryText(name: string, years: number): string {
  const isBirthday = name.includes("誕生日");
  if (years <= 0) return isBirthday ? `🎂 今日は${name}です！` : `🎉 今日は${name}です！`;
  return isBirthday ? `🎂 今日は${name}、${years}歳になります！` : `🎉 今日は${name}、${years}周年です！`;
}

/** 今日の月日と一致する記念日を抽出し、LINE等にそのまま使える案内文を添える。 */
export function anniversariesOnDate<T extends AnniversaryLike>(rows: T[], todayStr: string): AnniversaryHit[] {
  const todayMD = monthDay(todayStr);
  return rows
    .filter((r) => monthDay(r.date) === todayMD)
    .map((r) => ({ name: r.name, years: yearsSince(r.date, todayStr), text: anniversaryText(r.name, yearsSince(r.date, todayStr)) }));
}

export interface YearAnniversaryHit {
  date: string; // その年におけるこの記念日の日付
  name: string;
  years: number;
  text: string;
}

/** 指定した年に存在する記念日（起点日以降の年のみ）を、その年の日付に射影する。年間タイムライン用。 */
export function anniversariesInYear<T extends AnniversaryLike>(rows: T[], year: number): YearAnniversaryHit[] {
  return rows
    .filter((r) => yearOf(r.date) <= year)
    .map((r) => {
      const years = year - yearOf(r.date);
      const isBirthday = r.name.includes("誕生日");
      const text = years === 0 ? (isBirthday ? "誕生" : "この日") : isBirthday ? `${years}歳の誕生日` : `${years}周年`;
      return { date: `${year}-${monthDay(r.date)}`, name: r.name, years, text };
    });
}

/** 今日以降で一番近いこの記念日の日付（今年分がもう過ぎていたら来年）。 */
export function nextOccurrence(dateStr: string, todayStr: string): string {
  const md = monthDay(dateStr);
  const todayYear = yearOf(todayStr);
  const candidate = `${todayYear}-${md}`;
  return candidate >= todayStr ? candidate : `${todayYear + 1}-${md}`;
}

export function daysUntil(targetDateStr: string, todayStr: string): number {
  const t = Date.parse(`${targetDateStr}T00:00:00Z`);
  const n = Date.parse(`${todayStr}T00:00:00Z`);
  return Math.round((t - n) / 86400000);
}
