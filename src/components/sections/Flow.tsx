"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/judge";
import { TONE_COLOR } from "@/lib/constants";
import { apiGet } from "@/lib/apiClient";
import type { AccountAggregateOut, FlowPeriodResponse } from "@/lib/apiTypes";
import { SectionHead, MoneyViewToggle } from "../common";
import { useDashboard } from "../DashboardContext";
import FlowDiagram from "./FlowDiagram";
import SpendCalendar from "./SpendCalendar";

const PERIODS: { n: 1 | 3 | 6 | 12; label: string }[] = [
  { n: 1, label: "今月" },
  { n: 3, label: "過去3ヶ月" },
  { n: 6, label: "過去6ヶ月" },
  { n: 12, label: "過去12ヶ月" },
];

export default function Flow() {
  const { month, monthKey, ownerFilter } = useDashboard();
  const [periodMonths, setPeriodMonths] = useState<1 | 3 | 6 | 12>(1);
  // fetchKeyで「このデータがどの条件で取れたものか」を持たせ、条件が変わったら古いデータを
  // 使わず「読み込み中」扱いにする（effect内でのsetState(null)呼び出しを避けるため）。
  const [periodFetch, setPeriodFetch] = useState<{ key: string; data: FlowPeriodResponse } | null>(null);
  const fetchKey = `${monthKey}:${periodMonths}:${ownerFilter ?? ""}`;

  useEffect(() => {
    if (periodMonths === 1) return;
    let cancelled = false;
    const key = `${monthKey}:${periodMonths}:${ownerFilter ?? ""}`;
    const ownerQs = ownerFilter ? `&owner=${ownerFilter}` : "";
    apiGet<FlowPeriodResponse>(`/api/flow-period?m=${monthKey}&months=${periodMonths}${ownerQs}`)
      .then((r) => {
        if (!cancelled) setPeriodFetch({ key, data: r });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [periodMonths, monthKey, ownerFilter]);

  if (!month) return null;

  const isPeriod = periodMonths > 1;
  const periodData = periodFetch?.key === fetchKey ? periodFetch.data : null;
  const income = isPeriod ? (periodData?.income ?? 0) : month.aggregates.monthTotals.income;
  const perAccount: AccountAggregateOut[] = isPeriod ? (periodData?.perAccount ?? []) : month.aggregates.perAccount;
  const loadingPeriod = isPeriod && !periodData;

  return (
    <section className="mf-section">
      <SectionHead no="02" title="お金の流れ" sub="収入がどの口座に配分され、どれだけ使われたか。" />
      <MoneyViewToggle />
      <div className="mf-chips" style={{ marginBottom: 12 }}>
        {PERIODS.map((p) => (
          <button key={p.n} className={"mf-chipbtn" + (periodMonths === p.n ? " on" : "")} onClick={() => setPeriodMonths(p.n)}>
            {p.label}
          </button>
        ))}
      </div>
      {loadingPeriod ? (
        <div className="mf-empty" style={{ padding: 40, textAlign: "center" }}>
          読み込み中…
        </div>
      ) : (
        <>
          <FlowDiagram income={income} accounts={perAccount} />
          <div className="mf-panel">
            <div className="mf-paneltitle">
              配分の詳細{isPeriod && periodData && `（${monthKey.replace("-", "年")}月までの${periodData.months}ヶ月合計、予算は月次×${periodData.months}）`}
            </div>
            <div className="mf-tabwrap">
              <div className="mf-tabhead">
                <span>口座</span>
                <span>予算</span>
                <span>使用</span>
                <span>残り</span>
                <span>消化率</span>
                <span>判定</span>
              </div>
              {perAccount.map((a) => (
                <div key={a.id} className="mf-tabrow">
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span className="mf-dot" style={{ background: a.color }} />
                    <span className="mf-tabname">{a.name}</span>
                  </span>
                  <span className="mf-mono">{fmt(a.budget)}</span>
                  <span className="mf-mono">{fmt(a.spent)}</span>
                  <span className="mf-mono" style={{ color: a.budget - a.spent < 0 ? "#F26D5F" : undefined }}>
                    {fmt(a.budget - a.spent)}
                  </span>
                  <span className="mf-mono">{a.budget ? Math.round((a.spent / a.budget) * 100) + "%" : "—"}</span>
                  <span>
                    <span className="mf-chip" style={{ marginLeft: 0, color: TONE_COLOR[a.judge.tone], borderColor: TONE_COLOR[a.judge.tone] }}>
                      {a.judge.label}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {!isPeriod && (
        <SpendCalendar monthKey={monthKey} expenses={month.expenses} perDay={month.aggregates.perDay} accounts={month.aggregates.perAccount} />
      )}
    </section>
  );
}
