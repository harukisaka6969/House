"use client";

import type { CSSProperties, ReactNode } from "react";
import { getPeriodMonthGrids, isInPeriod } from "@/lib/periodCalendar";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

/** 25日始まり・翌月24日締めの「月」(monthKey)を、暦月2つ分のグリッドとして表示する共通カレンダー。
 * 期間外の日（前半月の1〜24日・後半月の25日以降）は薄く表示しつつも、前後の文脈として見せる。 */
export default function PeriodCalendar({
  monthKey,
  cellClassName,
  cellStyle,
  renderCell,
  onSelectDate,
}: {
  monthKey: string;
  cellClassName: (date: string) => string;
  cellStyle?: (date: string) => CSSProperties | undefined;
  renderCell: (date: string, day: number) => ReactNode;
  onSelectDate: (date: string) => void;
}) {
  const grids = getPeriodMonthGrids(monthKey);

  return (
    <>
      {grids.map((g) => (
        <div key={g.monthKey} style={{ marginBottom: 10 }}>
          <div className="mf-calgrouplabel">{g.label}</div>
          <div className="mf-calgrid">
            {DOW.map((d, i) => (
              <div key={d} className={"mf-calhead" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}>
                {d}
              </div>
            ))}
            {g.cells.map((d, i) => {
              if (d === null) return <div key={"e" + i} />;
              const date = `${g.monthKey}-${String(d).padStart(2, "0")}`;
              const out = !isInPeriod(date, monthKey);
              return (
                <button
                  key={date}
                  className={cellClassName(date) + (out ? " outperiod" : "")}
                  style={cellStyle?.(date)}
                  onClick={() => onSelectDate(date)}
                >
                  {renderCell(date, d)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
