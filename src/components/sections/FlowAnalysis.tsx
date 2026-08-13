"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { fmt } from "@/lib/judge";
import { apiGet } from "@/lib/apiClient";
import type { FlowAnalysisResponse, FlowMonthPoint } from "@/lib/apiTypes";
import { SectionHead, StatCard, TT, MoneyViewToggle } from "../common";
import { useDashboard } from "../DashboardContext";

// dataviz skill: 固定順の検証済みカテゴリカルパレット（ダーク面 #181E25 で全隣接ペアが基準を満たす、node scripts/validate_palette.jsで検証済み）
const SERIES_COLORS = ["#3987e5", "#008300", "#d55181", "#c98500", "#199e70", "#d95926"];
const OTHER_COLOR = "#6b6a66";
const INCOME_REGULAR_COLOR = "#3987e5";
const INCOME_SPECIAL_COLOR = "#d95926";
const NET_LINE_COLOR = "#45C48F";

const RANGES = [
  { key: "6", label: "直近6ヶ月" },
  { key: "12", label: "直近12ヶ月" },
  { key: "all", label: "全期間" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function monthLabel(m: string): string {
  return m.slice(2).replace("-", "/");
}

export default function FlowAnalysis() {
  const { ownerFilter } = useDashboard();
  const [data, setData] = useState<FlowAnalysisResponse | null>(null);
  const [range, setRange] = useState<RangeKey>("12");
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const qs = ownerFilter ? `?owner=${ownerFilter}` : "";
    apiGet<FlowAnalysisResponse>(`/api/flow-analysis${qs}`).then(setData).catch(() => {});
  }, [ownerFilter]);

  const categories = useMemo(() => {
    if (!data) return [];
    const top = data.categories.slice(0, SERIES_COLORS.length);
    return top;
  }, [data]);

  const catColor = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c, i) => map.set(c, SERIES_COLORS[i]));
    return map;
  }, [categories]);

  const months: FlowMonthPoint[] = useMemo(() => {
    if (!data) return [];
    if (range === "all") return data.months;
    const n = Number(range);
    return data.months.slice(-n);
  }, [data, range]);

  const totals = useMemo(() => {
    return months.reduce(
      (acc, m) => {
        acc.income += m.incomeTotal;
        acc.expense += m.expenseTotal;
        acc.invest += m.investTotal;
        return acc;
      },
      { income: 0, expense: 0, invest: 0 }
    );
  }, [months]);

  const incomeChartData = months.map((m) => ({
    month: monthLabel(m.month),
    定期収入: m.incomeRegular,
    特別収入: m.incomeSpecial,
  }));

  const expenseChartData = months.map((m) => {
    const row: Record<string, string | number> = { month: monthLabel(m.month) };
    let known = 0;
    for (const c of categories) {
      const found = m.expenseByCategory.find((e) => e.name === c);
      row[c] = found?.value ?? 0;
      known += found?.value ?? 0;
    }
    row["その他計"] = Math.max(0, m.expenseTotal - known);
    return row;
  });

  const netChartData = months.map((m) => ({
    month: monthLabel(m.month),
    累計収支: m.cumulativeNet,
    単月収支: m.net,
  }));

  if (!data) {
    return (
      <section className="mf-section">
        <SectionHead no="13" title="資産フロー分析" sub="収入・支出・資産の推移をまとめて見る。" />
        <div className="mf-empty" style={{ padding: 40, textAlign: "center" }}>読み込み中…</div>
      </section>
    );
  }

  const net = totals.income - totals.expense;

  return (
    <section className="mf-section">
      <SectionHead no="13" title="資産フロー分析" sub="収入・支出・資産の推移をまとめて見る。過去のログも含む。" />
      <MoneyViewToggle />

      <div className="mf-chips">
        {RANGES.map((r) => (
          <button key={r.key} className={"mf-chipbtn" + (range === r.key ? " on" : "")} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="mf-cards4" style={{ marginTop: 12 }}>
        <StatCard label="期間内 収入合計" value={fmt(totals.income)} color="#45C48F" />
        <StatCard label="期間内 支出合計" value={fmt(totals.expense)} color="#F26D5F" />
        <StatCard label="期間内 投資合計" value={fmt(totals.invest)} color="#8B7CF6" />
        <StatCard label="期間内 収支" value={(net >= 0 ? "+" : "") + fmt(net)} color={net >= 0 ? "#45C48F" : "#F26D5F"} />
      </div>

      {data.specialEvents.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">大きな特別収支（結婚式・ご祝儀など）</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.specialEvents.map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                <span style={{ color: "#93A0AE" }}>
                  {e.date}　<span style={{ color: "#C4CDD6" }}>{e.name}</span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{e.ownerName}</span>
                </span>
                <span className="mf-mono" style={{ color: e.type === "income" ? "#45C48F" : "#F26D5F" }}>
                  {e.type === "income" ? "+" : "-"}
                  {fmt(e.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mf-panel">
        <div className="mf-paneltitle">月別収入内訳（定期収入 / 特別収入）</div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={incomeChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="month" stroke="#93A0AE" fontSize={11} />
              <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => v / 10000 + "万"} width={44} />
              <Tooltip contentStyle={TT} formatter={(v: unknown) => fmt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="定期収入" stackId="income" fill={INCOME_REGULAR_COLOR} radius={[0, 0, 0, 0]} />
              <Bar dataKey="特別収入" stackId="income" fill={INCOME_SPECIAL_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">月別支出内訳（カテゴリ別）</div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={expenseChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="month" stroke="#93A0AE" fontSize={11} />
              <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => v / 10000 + "万"} width={44} />
              <Tooltip contentStyle={TT} formatter={(v: unknown) => fmt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {categories.map((c, i) => (
                <Bar key={c} dataKey={c} stackId="expense" fill={catColor.get(c) ?? SERIES_COLORS[i]} radius={[0, 0, 0, 0]} />
              ))}
              <Bar dataKey="その他計" name="その他（上位分類外）" stackId="expense" fill={OTHER_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">累計収支の推移</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <ComposedChart data={netChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" stroke="#93A0AE" fontSize={11} />
              <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => v / 10000 + "万"} width={44} />
              <Tooltip contentStyle={TT} formatter={(v: unknown) => fmt(Number(v))} />
              <Line type="monotone" dataKey="累計収支" stroke={NET_LINE_COLOR} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mf-hint" style={{ opacity: 0.7 }}>
          記録されている範囲（{monthLabel(data.months[0]?.month ?? "")}〜{monthLabel(data.months[data.months.length - 1]?.month ?? "")}）の収入−支出の累計です。開始時点の資産残高は含みません。
        </div>
      </div>

      <div className="mf-panel">
        <button className="mf-chipbtn" onClick={() => setShowTable((s) => !s)}>
          {showTable ? "表を閉じる" : "月別データを表で見る"}
        </button>
        {showTable && (
          <div className="mf-tabwrap" style={{ marginTop: 10, overflowX: "auto" }}>
            <div className="mf-tabhead" style={{ gridTemplateColumns: "80px repeat(4, 1fr)" }}>
              <span>月</span>
              <span>収入</span>
              <span>支出</span>
              <span>投資</span>
              <span>単月収支</span>
            </div>
            {months.map((m) => (
              <div key={m.month} className="mf-tabrow" style={{ gridTemplateColumns: "80px repeat(4, 1fr)" }}>
                <span>{monthLabel(m.month)}</span>
                <span className="mf-mono">{fmt(m.incomeTotal)}</span>
                <span className="mf-mono">{fmt(m.expenseTotal)}</span>
                <span className="mf-mono">{fmt(m.investTotal)}</span>
                <span className="mf-mono" style={{ color: m.net >= 0 ? "#45C48F" : "#F26D5F" }}>
                  {(m.net >= 0 ? "+" : "") + fmt(m.net)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
