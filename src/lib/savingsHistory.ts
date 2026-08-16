import { dayOfWeek, addDaysStr } from "./date";

export interface SavingsHistoryItem {
  id: string;
  date: string;
  title: string;
  emoji: string;
  estimated_saving: number;
  /** カードに紐づく履歴ならそのカードのid、単独記録（割引購入等）ならnull。削除時にどちらの経路で
   * 消すか判定するために使う。省略可（グルーピング処理そのものはこの値を使わないため）。 */
  action_id?: string | null;
}

export interface DayGroup {
  date: string;
  total: number;
  items: SavingsHistoryItem[];
}

export interface WeekGroup {
  weekStart: string;
  weekEnd: string;
  total: number;
  count: number;
}

/** 節約アクションを日付ごとにグループ化する（新しい日付順）。 */
export function groupSavingsByDay(items: SavingsHistoryItem[]): DayGroup[] {
  const map = new Map<string, SavingsHistoryItem[]>();
  for (const it of items) {
    const arr = map.get(it.date) ?? [];
    arr.push(it);
    map.set(it.date, arr);
  }
  return Array.from(map.entries())
    .map(([date, its]) => ({ date, items: its, total: its.reduce((s, i) => s + i.estimated_saving, 0) }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** その日を含む週の始まり（日曜）の日付を返す。 */
export function weekStartOfDate(dateStr: string): string {
  return addDaysStr(dateStr, -dayOfWeek(dateStr));
}

/** 節約アクションを週（日曜始まり）ごとに集計する（新しい週順）。 */
export function groupSavingsByWeek(items: SavingsHistoryItem[]): WeekGroup[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const it of items) {
    const ws = weekStartOfDate(it.date);
    const cur = map.get(ws) ?? { total: 0, count: 0 };
    cur.total += it.estimated_saving;
    cur.count += 1;
    map.set(ws, cur);
  }
  return Array.from(map.entries())
    .map(([weekStart, v]) => ({ weekStart, weekEnd: addDaysStr(weekStart, 6), total: v.total, count: v.count }))
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

/** カレンダー表示用: 日付 → その日の節約合計額のマップ。 */
export function savingsPerDayMap(items: SavingsHistoryItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[it.date] = (out[it.date] ?? 0) + it.estimated_saving;
  return out;
}
