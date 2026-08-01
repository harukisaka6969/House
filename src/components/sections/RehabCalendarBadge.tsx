"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { todayStrJST, periodKeyOfDate } from "@/lib/date";
import PeriodCalendar from "../PeriodCalendar";

/** ハルキの振り返り記録が「ある日」だけを見られる、内容非公開のカレンダー（アリサ側の表示用）。 */
export default function RehabCalendarBadge({ date, onSelectDate }: { date: string; onSelectDate: (d: string) => void }) {
  const monthKey = periodKeyOfDate(date);
  const [dates, setDates] = useState<string[] | null>(null);

  useEffect(() => {
    apiGet<{ dates: string[] }>(`/api/rehab-logs/calendar?month=${monthKey}`)
      .then((r) => setDates(r.dates))
      .catch(() => setDates([]));
  }, [monthKey]);

  if (!dates || dates.length === 0) return null;

  const today = todayStrJST();
  const marked = new Set(dates);

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">ハルキの振り返り記録（内容は非公開）</div>
      <div className="mf-hint" style={{ opacity: 0.75, marginBottom: 10 }}>
        赤丸のある日は、ハルキが個人の振り返りを記録した日です。内容は表示されません。
      </div>
      <PeriodCalendar
        monthKey={monthKey}
        onSelectDate={onSelectDate}
        cellClassName={(key) => "mf-rehabcell" + (date === key ? " sel" : "") + (key === today ? " today" : "")}
        renderCell={(key, d) => (
          <>
            {d}
            {marked.has(key) && <span className="mf-rehabmark" />}
          </>
        )}
      />
    </div>
  );
}
