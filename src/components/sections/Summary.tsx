"use client";

import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { fmt, monthJudge } from "@/lib/judge";
import { TONE_COLOR } from "@/lib/constants";
import { apiGet } from "@/lib/apiClient";
import type { UpcomingSummary } from "@/lib/apiTypes";
import { SectionHead, StatCard, TT, fmtTooltip } from "../common";
import { useDashboard } from "../DashboardContext";

function dsub(cur: number, pv: number | null | undefined): string | null {
  if (pv == null) return null;
  return (cur - pv >= 0 ? "+" : "") + fmt(cur - pv) + " 前月比";
}

function Upcoming30d() {
  const [data, setData] = useState<UpcomingSummary | null>(null);
  useEffect(() => {
    apiGet<UpcomingSummary>("/api/summary/upcoming-30d").then(setData).catch(() => {});
  }, []);
  if (!data || data.total === 0) return null;
  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">今後30日の予定支出</div>
      <div className="mf-num mf-mono">{fmt(data.total)}</div>
      <div className="mf-numsub">
        メンテ予定 {data.maintenanceCount}件 {fmt(data.maintenanceCost)}
        {data.wishlistCount > 0 && ` ／ ウィッシュ積立予定 ${data.wishlistCount}件 ${fmt(data.wishlistMonthlyPlan)}`}
      </div>
    </div>
  );
}

export default function Summary() {
  const { month, prevMonth, trend } = useDashboard();
  if (!month) return null;

  const { income, expense, invest } = month.aggregates.monthTotals;
  const balance = income - expense;
  const judge = monthJudge(income, expense);
  const prev = prevMonth?.aggregates.monthTotals ?? null;

  const topCats = [...month.aggregates.perCategory].sort((a, b) => b.value - a.value).slice(0, 5);
  const trendData = trend.map((t) => ({ month: t.month.slice(2).replace("-", "/"), 収入: t.income, 支出: t.expense, 投資: t.invest }));

  return (
    <section className="mf-section">
      <SectionHead no="01" title="今月のサマリー" sub="いちばん大きい視点。この月がどうだったか。" />
      <div className="mf-cards4">
        <StatCard label="収入" value={fmt(income)} color="#E7ECF2" sub={dsub(income, prev?.income)} />
        <StatCard label="支出" value={fmt(expense)} color="#F26D5F" sub={dsub(expense, prev?.expense)} />
        <StatCard label="投資" value={fmt(invest)} color="#8B7CF6" sub={dsub(invest, prev?.invest)} />
        <StatCard label="収支" value={(balance > 0 ? "+" : "") + fmt(balance)} color={balance >= 0 ? "#45C48F" : "#F26D5F"} />
      </div>
      <div className="mf-judgecard" style={{ borderColor: TONE_COLOR[judge.tone] }}>
        <div className="mf-judgelabel" style={{ color: TONE_COLOR[judge.tone] }}>
          {judge.label}
        </div>
        <div className="mf-judgenote">{judge.note}</div>
      </div>
      <Upcoming30d />
      {topCats.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">支出トップカテゴリ</div>
          {topCats.map((c) => (
            <div key={c.name} className="mf-catbar">
              <span className="mf-catbarname">{c.name}</span>
              <div className="mf-bar" style={{ flex: 1, marginTop: 0 }}>
                <div className="mf-barfill" style={{ width: `${(c.value / topCats[0].value) * 100}%`, background: "#F5A524" }} />
              </div>
              <span className="mf-mono mf-catbaramt">{fmt(c.value)}</span>
            </div>
          ))}
          <div className="mf-hint" style={{ opacity: 0.7 }}>
            相手の第3口座分は金額非公開のため含まれません。
          </div>
        </div>
      )}
      {trendData.length > 1 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">月別推移（直近12ヶ月）</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" stroke="#93A0AE" fontSize={11} />
                <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => v / 10000 + "万"} width={44} />
                <Tooltip contentStyle={TT} formatter={fmtTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="収入" stroke="#45C48F" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="支出" stroke="#F26D5F" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="投資" stroke="#8B7CF6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
