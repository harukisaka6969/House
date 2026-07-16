"use client";

import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { fmt } from "@/lib/judge";
import { SectionHead, TT, fmtTooltip } from "../common";
import { useDashboard } from "../DashboardContext";

interface SimParams {
  income: number;
  expense: number;
  investRatio: number;
  annualReturn: number;
  years: number;
  startCash: number;
  startInvested: number;
}

function SimPanelInner({ defaultIncome, defaultExpense }: { defaultIncome: number; defaultExpense: number }) {
  const [p, setP] = useState<SimParams>({
    income: defaultIncome || 350000,
    expense: defaultExpense || 250000,
    investRatio: 50,
    annualReturn: 4,
    years: 15,
    startCash: 0,
    startInvested: 0,
  });
  const set = (k: keyof SimParams) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Number(e.target.value) });

  const series = useMemo(() => {
    const run = (retPct: number) => {
      let cash = p.startCash;
      let invested = p.startInvested;
      const pts = [{ cash, invested }];
      const mr = retPct / 100 / 12;
      for (let y = 1; y <= p.years; y++) {
        for (let m = 0; m < 12; m++) {
          const surplus = p.income - p.expense;
          const inv = Math.max(surplus, 0) * (p.investRatio / 100);
          invested = invested * (1 + mr) + inv;
          cash += surplus - inv;
        }
        pts.push({ cash, invested });
      }
      return pts;
    };
    const base = run(p.annualReturn);
    const hi = run(p.annualReturn + 2);
    const lo = run(Math.max(p.annualReturn - 2, 0));
    return base.map((b, i) => ({
      year: i === 0 ? "現在" : `${i}年後`,
      現金: Math.round(b.cash),
      投資資産: Math.round(b.invested),
      合計: Math.round(b.cash + b.invested),
      "楽観(+2%)": Math.round(hi[i].cash + hi[i].invested),
      "悲観(-2%)": Math.round(lo[i].cash + lo[i].invested),
    }));
  }, [p]);

  const final = series[series.length - 1];

  const fields: [string, keyof SimParams, number, string][] = [
    ["月収（平均）", "income", 1, "円"],
    ["月支出（平均）", "expense", 1, "円"],
    ["余剰の投資割合", "investRatio", 1, "%"],
    ["想定年利", "annualReturn", 0.5, "%"],
    ["期間", "years", 1, "年"],
    ["現在の現金", "startCash", 1, "円"],
    ["現在の投資資産", "startInvested", 1, "円"],
  ];

  return (
    <div className="mf-panel">
      <div className="mf-simgrid">
        {fields.map(([label, k, step, suffix]) => (
          <label key={k} className="mf-simfield">
            <span>{label}</span>
            <span className="mf-row" style={{ gap: 6 }}>
              <input className="mf-input mf-mono" type="number" step={step} value={p[k]} onChange={set(k)} />
              <span className="mf-numsub">{suffix}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mf-simresult">
        {p.years}年後の想定資産:{" "}
        <b className="mf-mono" style={{ color: "#45C48F", fontSize: 20 }}>
          {fmt(final.合計)}
        </b>
        <span className="mf-numsub">
          （現金 {fmt(final.現金)} ＋ 投資 {fmt(final.投資資産)} ／ シナリオ幅 {fmt(final["悲観(-2%)"])} 〜 {fmt(final["楽観(+2%)"])}）
        </span>
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="year" stroke="#93A0AE" fontSize={11} />
            <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => (v / 10000).toLocaleString() + "万"} width={60} />
            <Tooltip contentStyle={TT} formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="現金" stroke="#4C9AFF" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="投資資産" stroke="#8B7CF6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="合計" stroke="#45C48F" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="楽観(+2%)" stroke="#45C48F" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="悲観(-2%)" stroke="#F26D5F" strokeWidth={1} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mf-hint" style={{ opacity: 0.7 }}>
        複利は月次計算。年利や収支は将来を保証するものではありません。
      </div>
    </div>
  );
}

export default function Sim() {
  const { month } = useDashboard();
  const totals = month?.aggregates.monthTotals;

  return (
    <section className="mf-section">
      <SectionHead no="06" title="将来シミュレーション" sub="このペースが続いたら資産はどうなるか。楽観・悲観シナリオ付き。" />
      <SimPanelInner defaultIncome={totals?.income ?? 0} defaultExpense={totals?.expense ?? 0} />
    </section>
  );
}
