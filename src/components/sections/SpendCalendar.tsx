"use client";

import { useState } from "react";
import { fmt } from "@/lib/judge";
import { todayStrJST } from "@/lib/date";
import type { AccountOut, ExpenseOut } from "@/lib/apiTypes";
import { useDashboard } from "../DashboardContext";
import PeriodCalendar from "../PeriodCalendar";

function fmtShort(n: number): string {
  const v = Math.round(Number(n) || 0);
  if (v >= 10000) {
    const w = v / 10000;
    return (w >= 10 ? Math.round(w) : Math.round(w * 10) / 10) + "万";
  }
  return v.toLocaleString("ja-JP");
}

export default function SpendCalendar({
  monthKey,
  expenses,
  perDay,
  accounts,
}: {
  monthKey: string;
  expenses: ExpenseOut[];
  perDay: Record<string, number>;
  accounts: AccountOut[];
}) {
  const { me } = useDashboard();
  const meName = me?.profile.name ?? "";
  const [selDay, setSelDay] = useState<string | null>(null);
  const today = todayStrJST();

  const maxDay = Math.max(1, ...Object.values(perDay));
  const monthVisibleTotal = Object.values(perDay).reduce((s, v) => s + v, 0);

  const acctColor = (id: string) => accounts.find((a) => a.id === id)?.color ?? "#93A0AE";

  const dayRows = selDay
    ? expenses
        .filter((e): e is Extract<ExpenseOut, { masked: false }> => !e.masked && e.date === selDay)
        .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    : [];
  const maskedCount = selDay ? expenses.filter((e) => e.masked).length : 0;

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">日別カレンダー（濃いほど支出が多い日）</div>
      <PeriodCalendar
        monthKey={monthKey}
        onSelectDate={(key) => setSelDay(selDay === key ? null : key)}
        cellClassName={(key) => "mf-calcell" + (selDay === key ? " sel" : "") + (key === today ? " today" : "")}
        cellStyle={(key) => {
          const t = perDay[key] || 0;
          return t > 0 ? { background: `rgba(245,165,36,${(0.07 + 0.4 * (t / maxDay)).toFixed(2)})` } : undefined;
        }}
        renderCell={(key, d) => {
          const t = perDay[key] || 0;
          return (
            <>
              <span className="mf-calday">{d}</span>
              {t > 0 && <span className="mf-calamt mf-mono">{fmtShort(t)}</span>}
            </>
          );
        }}
      />
      <div className="mf-hint" style={{ opacity: 0.65 }}>
        表示合計 {fmt(monthVisibleTotal)}。相手の第3口座分は金額非公開のため含まれません。日をタップすると明細が見られます。
      </div>

      {selDay && (
        <div style={{ marginTop: 10 }}>
          <div className="mf-paneltitle">
            {selDay.slice(5).replace("-", "/")} の明細（{dayRows.length}件 ／ 表示分計 {fmt(perDay[selDay] || 0)}）
          </div>
          {dayRows.length === 0 ? (
            <div className="mf-empty">この日の支出はありません（相手の非公開分がある場合は日付が分からないため、ここには表示されません）。</div>
          ) : (
            <div className="mf-list">
              {dayRows.map((e) =>
                e.masked ? null : (
                  <div key={e.id} className="mf-listrow">
                    <span className="mf-dot" style={{ background: acctColor(e.account_id) }} />
                    <span className="mf-listcat">
                      {e.category}
                      {e.sub ? `（${e.sub}）` : ""}
                    </span>
                    {e.owner_name !== meName && <span className="mf-ownerchip">{e.owner_name}</span>}
                    <span className="mf-listmemo">{e.memo}</span>
                    <span className="mf-mono mf-listamt">{fmt(e.amount)}</span>
                  </div>
                )
              )}
            </div>
          )}
          {maskedCount > 0 && (
            <div className="mf-hint" style={{ opacity: 0.6 }}>
              🔒 相手の第3口座分は日付が非公開のため、この一覧に含まれません（口座の月合計には含まれています）。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
