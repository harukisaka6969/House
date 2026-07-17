"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { fmt } from "@/lib/judge";
import { apiGet } from "@/lib/apiClient";
import type { LifeEventOut, WishlistItemOut } from "@/lib/apiTypes";
import { nowMonthKeyJST } from "@/lib/date";
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

interface EventDeduction {
  yearOffset: number;
  name: string;
  amount: number;
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

  const [lifeEvents, setLifeEvents] = useState<LifeEventOut[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItemOut[]>([]);
  const [maintenanceMonthly, setMaintenanceMonthly] = useState(0);
  const [reflectEvents, setReflectEvents] = useState(true);
  const [includeMaintenance, setIncludeMaintenance] = useState(false);
  const [includeWishlist, setIncludeWishlist] = useState(false);

  useEffect(() => {
    apiGet<{ events: LifeEventOut[] }>("/api/life-events").then((r) => setLifeEvents(r.events)).catch(() => {});
    apiGet<{ items: WishlistItemOut[] }>("/api/wishlist").then((r) => setWishlist(r.items)).catch(() => {});
    apiGet<{ totalCost: number }>("/api/maintenance/upcoming?months=12").then((r) => setMaintenanceMonthly(Math.round(r.totalCost / 12))).catch(() => {});
  }, []);

  const wishlistMonthly = useMemo(
    () => wishlist.filter((w) => w.status === "saving").reduce((s, w) => s + w.monthly_plan, 0),
    [wishlist]
  );

  const currentYear = Number(nowMonthKeyJST().slice(0, 4));
  const eventDeductions: EventDeduction[] = useMemo(() => {
    if (!reflectEvents) return [];
    return lifeEvents
      .filter((e) => e.status === "active" && e.linked)
      .map((e) => ({
        yearOffset: e.event_year - currentYear,
        name: e.name,
        amount: Math.max(Math.round((e.cost_low + e.cost_high) / 2) - e.funded, 0),
      }))
      .filter((d) => d.yearOffset >= 0 && d.yearOffset <= p.years);
  }, [lifeEvents, reflectEvents, currentYear, p.years]);

  const series = useMemo(() => {
    const extraMonthly = (includeMaintenance ? maintenanceMonthly : 0) + (includeWishlist ? wishlistMonthly : 0);
    const effectiveExpense = p.expense + extraMonthly;

    const run = (retPct: number, applyEvents: boolean) => {
      let cash = p.startCash;
      let invested = p.startInvested;
      const dips: { year: number; name: string; total: number }[] = [];
      const pts = [{ cash, invested }];
      const mr = retPct / 100 / 12;
      for (let y = 1; y <= p.years; y++) {
        for (let m = 0; m < 12; m++) {
          const surplus = p.income - effectiveExpense;
          const inv = Math.max(surplus, 0) * (p.investRatio / 100);
          invested = invested * (1 + mr) + inv;
          cash += surplus - inv;
        }
        if (applyEvents) {
          for (const d of eventDeductions.filter((d) => d.yearOffset === y)) {
            let remaining = d.amount;
            const fromCash = Math.min(cash, remaining);
            cash -= fromCash;
            remaining -= fromCash;
            invested -= remaining;
            dips.push({ year: y, name: d.name, total: Math.round(cash + invested) });
          }
        }
        pts.push({ cash, invested });
      }
      return { pts, dips };
    };
    const base = run(p.annualReturn, true);
    const hi = run(p.annualReturn + 2, false);
    const lo = run(Math.max(p.annualReturn - 2, 0), false);
    const data = base.pts.map((b, i) => ({
      year: i === 0 ? "現在" : `${i}年後`,
      yearIdx: i,
      現金: Math.round(b.cash),
      投資資産: Math.round(b.invested),
      合計: Math.round(b.cash + b.invested),
      "楽観(+2%)": Math.round(hi.pts[i].cash + hi.pts[i].invested),
      "悲観(-2%)": Math.round(lo.pts[i].cash + lo.pts[i].invested),
    }));
    return { data, dips: base.dips };
  }, [p, includeMaintenance, includeWishlist, maintenanceMonthly, wishlistMonthly, eventDeductions]);

  const final = series.data[series.data.length - 1];

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

      <div className="mf-chips" style={{ marginTop: 10 }}>
        <button className={"mf-chipbtn" + (reflectEvents ? " on" : "")} onClick={() => setReflectEvents((v) => !v)}>
          ライフイベントを反映
        </button>
        <button className={"mf-chipbtn" + (includeMaintenance ? " on" : "")} onClick={() => setIncludeMaintenance((v) => !v)}>
          メンテ費を含める（月換算 {fmt(maintenanceMonthly)}）
        </button>
        <button className={"mf-chipbtn" + (includeWishlist ? " on" : "")} onClick={() => setIncludeWishlist((v) => !v)}>
          ウィッシュ積立を含める（{fmt(wishlistMonthly)}/月）
        </button>
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
      {series.dips.map((d) => (
        <div key={`${d.year}-${d.name}`} className="mf-hint" style={{ color: "#F5A524" }}>
          ⚠ {d.year}年後、{d.name}で資産が一時的に{fmt(d.total)}まで減少します。
        </div>
      ))}
      <div style={{ height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={series.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="year" stroke="#93A0AE" fontSize={11} />
            <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => (v / 10000).toLocaleString() + "万"} width={60} />
            <Tooltip contentStyle={TT} formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.dips.map((d) => (
              <ReferenceLine key={`${d.year}-${d.name}`} x={`${d.year}年後`} stroke="#F5A524" strokeDasharray="3 3" label={{ value: d.name, fontSize: 10, fill: "#F5A524", position: "top" }} />
            ))}
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
