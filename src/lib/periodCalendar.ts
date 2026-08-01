import { shiftMonth, periodKeyOfDate } from "./date";

export interface PeriodMonthGrid {
  monthKey: string;
  label: string;
  cells: (number | null)[];
}

/** 25日始まり・翌月24日締めの「月」(monthKey)を、暦月2つ分のカレンダーグリッドとして返す。
 * 前半月は1〜24日が期間外、後半月は25日以降が期間外になる（見た目は通常のグレゴリオ暦のまま、前後を含めて表示するため）。 */
export function getPeriodMonthGrids(monthKey: string): [PeriodMonthGrid, PeriodMonthGrid] {
  const build = (mk: string): PeriodMonthGrid => {
    const [y, m] = mk.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startDow = new Date(y, m - 1, 1).getDay();
    const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    return { monthKey: mk, label: `${y}年${m}月`, cells };
  };
  return [build(monthKey), build(shiftMonth(monthKey, 1))];
}

/** dateStr（YYYY-MM-DD）が、monthKeyの表す25-24期間に含まれるか。 */
export function isInPeriod(dateStr: string, monthKey: string): boolean {
  return periodKeyOfDate(dateStr) === monthKey;
}
