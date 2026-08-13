"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { fmt } from "@/lib/judge";
import { SectionHead, StatCard, TT, fmtTooltip, MoneyViewToggle } from "../common";
import { useDashboard } from "../DashboardContext";
import InvestPanel from "./InvestPanel";

function dsub(cur: number, pv: number | null | undefined): string | null {
  if (pv == null) return null;
  return (cur - pv >= 0 ? "+" : "") + fmt(cur - pv) + " 前月比";
}

export default function Invest() {
  const { month, prevMonth, trend } = useDashboard();
  if (!month) return null;
  const { invest } = month.aggregates.monthTotals;
  const prev = prevMonth?.aggregates.monthTotals ?? null;
  const trendData = trend.map((t) => ({ month: t.month.slice(2).replace("-", "/"), 投資: t.invest }));

  return (
    <section className="mf-section">
      <SectionHead no="05" title="投資" sub="今月の投資額・累計・銘柄別内訳と、銘柄リサーチ。" />
      <MoneyViewToggle />
      <div className="mf-cards4" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <StatCard label="今月の投資" value={fmt(invest)} color="#8B7CF6" sub={dsub(invest, prev?.invest)} />
        <StatCard label="累計投資額（記録全期間）" value={fmt(month.aggregates.cumInvest)} color="#E7ECF2" />
      </div>
      {trendData.length > 1 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">月別投資額の推移</div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" stroke="#93A0AE" fontSize={11} />
                <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => v / 10000 + "万"} width={44} />
                <Tooltip contentStyle={TT} formatter={fmtTooltip} />
                <Line type="monotone" dataKey="投資" stroke="#8B7CF6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <InvestPanel />
    </section>
  );
}
