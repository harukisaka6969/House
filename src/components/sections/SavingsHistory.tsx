"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiDelete } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import { periodRange } from "@/lib/date";
import { groupSavingsByDay, groupSavingsByWeek, savingsPerDayMap } from "@/lib/savingsHistory";
import type { SavingsHistoryOut } from "@/lib/apiTypes";
import { SectionHead, StatCard, MoneyViewToggle } from "../common";
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

function fmtWeekRange(weekStart: string, weekEnd: string): string {
  const short = (d: string) => d.slice(5).replace("-", "/");
  return `${short(weekStart)}〜${short(weekEnd)}`;
}

export default function SavingsHistory() {
  const { ownerFilter, monthKey } = useDashboard();
  const [history, setHistory] = useState<SavingsHistoryOut[] | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);

  const load = () => {
    const qs = ownerFilter ? `?owner=${ownerFilter}` : "";
    apiGet<{ history: SavingsHistoryOut[] }>(`/api/savings-actions${qs}`)
      .then((r) => setHistory(r.history))
      .catch(() => setHistory([]));
  };
  useEffect(load, [ownerFilter]);

  /** 間違って登録してしまった履歴を1件削除する。カードの初回分を消す場合は、他に履歴が残っていれば
   * 最も古い履歴がカードの初回分に昇格し（カード自体は消えない）、無ければカードごと削除される。 */
  const deleteEntry = async (entry: { id: string; action_id?: string | null; title: string }) => {
    if (!confirm(`「${entry.title}」の記録を削除しますか？`)) return;
    const qs = entry.action_id ? `?action_id=${entry.action_id}` : "";
    await apiDelete(`/api/savings-actions/history/${entry.id}${qs}`);
    load();
  };

  const { from, toExclusive } = periodRange(monthKey);
  const periodActions = useMemo(
    () => (history ?? []).filter((a) => a.date >= from && a.date < toExclusive),
    [history, from, toExclusive]
  );

  const dayGroups = useMemo(() => groupSavingsByDay(periodActions), [periodActions]);
  const weekGroups = useMemo(() => groupSavingsByWeek(periodActions), [periodActions]);
  const perDay = useMemo(() => savingsPerDayMap(periodActions), [periodActions]);
  const maxDay = Math.max(1, ...Object.values(perDay));
  const periodTotal = periodActions.reduce((s, a) => s + a.estimated_saving, 0);

  if (!history) return <div className="mf-empty">読み込み中…</div>;

  const visibleDayGroups = selDay ? dayGroups.filter((g) => g.date === selDay) : dayGroups;

  return (
    <section className="mf-section">
      <SectionHead no="26" title="節約履歴" sub="この期間の節約を、週ごとの合計・カレンダー・日ごとのリストで振り返れます。" />
      <MoneyViewToggle />

      <div className="mf-cards4">
        <StatCard label="この期間の節約合計" value={fmt(periodTotal)} color="#45C48F" />
        <StatCard label="登録件数" value={`${periodActions.length}件`} color="#E7ECF2" />
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">週ごとの節約合計</div>
        {weekGroups.length === 0 ? (
          <div className="mf-empty">この期間の記録はありません。</div>
        ) : (
          <div className="sv-weeklist">
            {weekGroups.map((w) => (
              <div key={w.weekStart} className="sv-weekrow">
                <span className="sv-weekrange">{fmtWeekRange(w.weekStart, w.weekEnd)}</span>
                <span className="sv-weekcount">{w.count}件</span>
                <span className="sv-weekamount mf-mono">{fmt(w.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">カレンダー（濃いほど節約額が多い日）</div>
        <PeriodCalendar
          monthKey={monthKey}
          onSelectDate={(key) => setSelDay((d) => (d === key ? null : key))}
          cellClassName={(key) => "mf-calcell" + (selDay === key ? " sel" : "")}
          cellStyle={(key) => {
            const t = perDay[key] || 0;
            return t > 0 ? { background: `rgba(69,196,143,${(0.08 + 0.4 * (t / maxDay)).toFixed(2)})` } : undefined;
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
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          日ごとの節約{selDay ? `（${selDay.slice(5).replace("-", "/")}）` : ""}
          {selDay && (
            <button className="mf-del" onClick={() => setSelDay(null)}>
              すべて表示
            </button>
          )}
        </div>
        {visibleDayGroups.length === 0 ? (
          <div className="mf-empty">この期間の記録はありません。</div>
        ) : (
          <div className="sv-daylist">
            {visibleDayGroups.map((g) => (
              <div key={g.date} className="sv-daygroup">
                <div className="sv-dayhead">
                  <span className="sv-daydate">{g.date.slice(5).replace("-", "/")}</span>
                  <span className="sv-daytotal mf-mono">{fmt(g.total)}</span>
                </div>
                {g.items.map((it) => (
                  <div key={it.id} className="sv-dayitem">
                    <span className="sv-dayitememoji">{it.emoji || "💡"}</span>
                    <span className="sv-dayitemtitle">{it.title}</span>
                    <span className="sv-dayitemamount mf-mono">{fmt(it.estimated_saving)}</span>
                    <button className="mf-del" style={{ marginLeft: 6 }} title="この記録を削除" onClick={() => deleteEntry(it)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
