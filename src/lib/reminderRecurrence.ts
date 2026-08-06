import { addDaysStr, dayOfWeek } from "./date";
import type { ReminderRow } from "./types";

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** fromDate（含む）以降で、そのリマインダーが次に該当する日付を返す。 */
export function nextOccurrence(r: Pick<ReminderRow, "recurrence_type" | "day_of_week" | "day_of_month">, fromDate: string): string {
  if (r.recurrence_type === "daily") return fromDate;

  if (r.recurrence_type === "weekly") {
    const target = r.day_of_week ?? 0;
    const from = dayOfWeek(fromDate);
    const delta = (target - from + 7) % 7;
    return addDaysStr(fromDate, delta);
  }

  // monthly: 今月の該当日（月の日数を超える場合は末日）が今日以降ならそれ、過ぎていれば来月分。
  const target = r.day_of_month ?? 1;
  const [y, m] = fromDate.split("-").map(Number);
  const thisMonthDay = Math.min(target, daysInMonth(y, m));
  const thisMonthDate = `${fromDate.slice(0, 7)}-${String(thisMonthDay).padStart(2, "0")}`;
  if (thisMonthDate >= fromDate) return thisMonthDate;

  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const nextMonthDay = Math.min(target, daysInMonth(nextY, nextM));
  return `${nextY}-${String(nextM).padStart(2, "0")}-${String(nextMonthDay).padStart(2, "0")}`;
}

/** todayの回をすでに完了済みなら、表示上の「次回」は繰り上げて次の回にする。 */
export function resolveNextDate(
  r: Pick<ReminderRow, "recurrence_type" | "day_of_week" | "day_of_month" | "last_completed_date">,
  today: string
): { next_date: string; done_today: boolean } {
  const raw = nextOccurrence(r, today);
  const doneToday = raw === today && r.last_completed_date === today;
  const next_date = doneToday ? nextOccurrence(r, addDaysStr(today, 1)) : raw;
  return { next_date, done_today: doneToday };
}
