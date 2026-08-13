"use client";

import { fmt } from "@/lib/judge";
import { TONE_COLOR } from "@/lib/constants";
import { SectionHead, MoneyViewToggle } from "../common";
import { useDashboard } from "../DashboardContext";
import FlowDiagram from "./FlowDiagram";
import SpendCalendar from "./SpendCalendar";

export default function Flow() {
  const { month, monthKey } = useDashboard();
  if (!month) return null;
  const { perAccount } = month.aggregates;
  const { income } = month.aggregates.monthTotals;

  return (
    <section className="mf-section">
      <SectionHead no="02" title="お金の流れ" sub="収入がどの口座に配分され、どれだけ使われたか。" />
      <MoneyViewToggle />
      <FlowDiagram income={income} accounts={perAccount} />
      <div className="mf-panel">
        <div className="mf-paneltitle">配分の詳細</div>
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
      <SpendCalendar monthKey={monthKey} expenses={month.expenses} perDay={month.aggregates.perDay} accounts={perAccount} />
    </section>
  );
}
