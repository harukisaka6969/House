"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { todayStrJST } from "@/lib/date";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

/** ハルキの振り返り記録が「ある日」だけを見られる、内容非公開のカレンダー（アリサ側の表示用）。 */
export default function RehabCalendarBadge({ date, onSelectDate }: { date: string; onSelectDate: (d: string) => void }) {
  const monthKey = date.slice(0, 7);
  const [dates, setDates] = useState<string[] | null>(null);

  useEffect(() => {
    apiGet<{ dates: string[] }>(`/api/rehab-logs/calendar?month=${monthKey}`)
      .then((r) => setDates(r.dates))
      .catch(() => setDates([]));
  }, [monthKey]);

  if (!dates || dates.length === 0) return null;

  const today = todayStrJST();
  const [y, m] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDow = new Date(y, m - 1, 1).getDay();
  const dkey = (d: number) => `${monthKey}-${String(d).padStart(2, "0")}`;
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const marked = new Set(dates);

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">ハルキの振り返り記録（内容は非公開）</div>
      <div className="mf-hint" style={{ opacity: 0.75, marginBottom: 10 }}>
        赤丸のある日は、ハルキが個人の振り返りを記録した日です。内容は表示されません。
      </div>
      <div className="mf-calgrid">
        {DOW.map((d, i) => (
          <div key={d} className={"mf-calhead" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}>
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={"e" + i} />;
          const key = dkey(d);
          return (
            <button
              key={key}
              className={"mf-rehabcell" + (date === key ? " sel" : "") + (key === today ? " today" : "")}
              onClick={() => onSelectDate(key)}
            >
              {d}
              {marked.has(key) && <span className="mf-rehabmark" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
