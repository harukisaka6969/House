"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, PieChart, Pie, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { apiGet } from "@/lib/apiClient";
import { todayStrJST, nowMonthKeyJST, shiftMonth, periodRange, periodEndInclusive } from "@/lib/date";
import { CAT_COLORS } from "@/lib/constants";
import { TT, fmtTooltip } from "../common";
import { useDashboard } from "../DashboardContext";
import type { AnalysisExportResult } from "@/lib/analysisExport";

type Dimension = "category" | "account" | "owner" | "weekday" | "monthly" | "daily";
type ChartType = "bar" | "pie" | "line";
type Preset = "thisMonth" | "lastMonth" | "3m" | "6m" | "1y" | "all" | "custom";
type OwnerSel = "all" | "me";

interface ChartConfig {
  dimension: Dimension;
  chartType: ChartType;
  metrics: string[]; // monthly次元のみ使用（収入/支出/投資）
  preset: Preset;
  customFrom: string;
  customTo: string;
  accountIds: string[];
  categories: string[];
  owner: OwnerSel;
}

interface Point {
  name: string;
  [metric: string]: number | string;
}

const STORAGE_KEY = "house.summaryChartConfig.v1";

const DIMENSION_LABEL: Record<Dimension, string> = {
  category: "カテゴリ別",
  account: "口座別",
  owner: "誰の支出か別",
  weekday: "曜日別",
  monthly: "月別推移",
  daily: "日別推移",
};

const CHART_TYPES_FOR: Record<Dimension, ChartType[]> = {
  category: ["bar", "pie"],
  account: ["bar", "pie"],
  owner: ["bar", "pie"],
  weekday: ["bar", "pie"],
  monthly: ["bar", "line"],
  daily: ["bar", "line"],
};

const CHART_TYPE_LABEL: Record<ChartType, string> = { bar: "📊 棒グラフ", pie: "🥧 円グラフ", line: "📈 折れ線グラフ" };

const MONTHLY_METRICS: { id: string; label: string }[] = [
  { id: "income", label: "収入" },
  { id: "expense", label: "支出" },
  { id: "invest", label: "投資" },
];

const SERIES_COLOR: Record<string, string> = { 収入: "#45C48F", 支出: "#F26D5F", 投資: "#8B7CF6" };

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const PRESETS: [Preset, string][] = [
  ["thisMonth", "今月"],
  ["lastMonth", "先月"],
  ["3m", "直近3ヶ月"],
  ["6m", "半年"],
  ["1y", "1年"],
  ["all", "全期間"],
  ["custom", "カスタム"],
];

function presetRange(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  if (preset === "custom") return { from: customFrom, to: customTo };
  const today = todayStrJST();
  const curMonth = nowMonthKeyJST();
  switch (preset) {
    case "thisMonth":
      return { from: periodRange(curMonth).from, to: today };
    case "lastMonth": {
      const m = shiftMonth(curMonth, -1);
      return { from: periodRange(m).from, to: periodEndInclusive(m) };
    }
    case "3m":
      return { from: periodRange(shiftMonth(curMonth, -2)).from, to: today };
    case "6m":
      return { from: periodRange(shiftMonth(curMonth, -5)).from, to: today };
    case "1y":
      return { from: periodRange(shiftMonth(curMonth, -11)).from, to: today };
    default:
      return { from: "2000-01-01", to: today };
  }
}

function defaultConfig(): ChartConfig {
  const today = todayStrJST();
  return {
    dimension: "category",
    chartType: "pie",
    metrics: ["expense"],
    preset: "thisMonth",
    customFrom: today,
    customTo: today,
    accountIds: [],
    categories: [],
    owner: "all",
  };
}

function toggleInArray(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/** 選んだ切り口に応じて、レポートAPI（/api/export/analysis）の集計結果からグラフ用の点列を作る。 */
function pointsFor(config: ChartConfig, result: AnalysisExportResult): Point[] {
  switch (config.dimension) {
    case "category":
      return result.by_category.map((c) => ({ name: c.category, 支出: c.total }));
    case "account": {
      const nameOf = (id: string) => result.meta.accounts.find((a) => a.id === id)?.name.replace(/（.*）/, "") ?? id;
      return result.by_account.map((a) => ({ name: nameOf(a.account), 支出: a.total_all }));
    }
    case "owner":
      return result.by_owner.map((o) => ({ name: o.owner_name, 支出: o.total }));
    case "weekday":
      return WEEKDAY_LABELS.map((label, i) => ({ name: label, 支出: result.by_weekday[String(i)] ?? 0 }));
    case "monthly":
      return result.monthly.map((m) => ({
        name: m.month.slice(2).replace("-", "/"),
        収入: m.income,
        支出: m.expense_all,
        投資: m.invest,
      }));
    case "daily":
      return result.daily.map((d) => ({ name: d.date.slice(5), 支出: d.expense_visible }));
  }
}

function seriesKeysFor(config: ChartConfig): string[] {
  if (config.dimension !== "monthly") return ["支出"];
  return MONTHLY_METRICS.filter((m) => config.metrics.includes(m.id)).map((m) => m.label);
}

function renderChart(config: ChartConfig, points: Point[]) {
  const keys = seriesKeysFor(config);
  if (config.chartType === "pie") {
    return (
      <PieChart>
        <Pie data={points} dataKey={keys[0]} nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {points.map((p, i) => (
            <Cell key={p.name} fill={CAT_COLORS[i % CAT_COLORS.length]} stroke="none" />
          ))}
        </Pie>
        <Tooltip contentStyle={TT} formatter={fmtTooltip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    );
  }
  const angled = points.length > 8;
  if (config.chartType === "line") {
    return (
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: angled ? 24 : 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="name" stroke="#93A0AE" fontSize={11} minTickGap={16} angle={angled ? -35 : 0} textAnchor={angled ? "end" : "middle"} height={angled ? 44 : 24} />
        <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => v / 10000 + "万"} width={44} />
        <Tooltip contentStyle={TT} formatter={fmtTooltip} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((k) => (
          <Line key={k} type="monotone" dataKey={k} stroke={SERIES_COLOR[k] ?? "#F5A524"} strokeWidth={2} dot={points.length <= 40} />
        ))}
      </LineChart>
    );
  }
  return (
    <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: angled ? 24 : 0 }}>
      <CartesianGrid stroke="rgba(255,255,255,0.06)" />
      <XAxis dataKey="name" stroke="#93A0AE" fontSize={11} interval={0} angle={angled ? -35 : 0} textAnchor={angled ? "end" : "middle"} height={angled ? 44 : 24} />
      <YAxis stroke="#93A0AE" fontSize={11} tickFormatter={(v) => v / 10000 + "万"} width={44} />
      <Tooltip contentStyle={TT} formatter={fmtTooltip} />
      {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {keys.map((k) => (
        <Bar key={k} dataKey={k} fill={SERIES_COLOR[k] ?? "#F5A524"} radius={[4, 4, 0, 0]} />
      ))}
    </BarChart>
  );
}

async function fetchAnalysis(config: ChartConfig): Promise<AnalysisExportResult> {
  const range = presetRange(config.preset, config.customFrom, config.customTo);
  const params = new URLSearchParams();
  params.set("from", range.from);
  params.set("to", range.to);
  params.set("owner", config.owner);
  params.set("granularity", config.dimension === "daily" ? "daily" : "monthly");
  if (config.accountIds.length) params.set("accounts", config.accountIds.join(","));
  if (config.categories.length) params.set("categories", config.categories.join(","));
  return apiGet<AnalysisExportResult>(`/api/export/analysis?${params.toString()}`);
}

/**
 * サマリーページのインタラクティブなグラフ。設定はポップアップ（小さいボタンで開閉）で選び、
 * 「生成する」を押すまでグラフには反映しない。一度生成したグラフは、次に生成し直すまで
 * 設定と一緒にlocalStorageへ保存し、再訪時も同じグラフを表示し続ける。
 */
export default function SummaryChartBuilder() {
  const { settings, allCats } = useDashboard();
  const accounts = settings?.accounts ?? [];

  /** 前回保存した設定があれば、初回レンダリング時点でそれを復元しておく（SSR時はwindowが無いのでデフォルト）。 */
  const [config, setConfig] = useState<ChartConfig>(() => {
    if (typeof window === "undefined") return defaultConfig();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as ChartConfig;
    } catch {
      /* 壊れた保存データは無視する */
    }
    return defaultConfig();
  });
  const [appliedConfig, setAppliedConfig] = useState<ChartConfig | null>(null);
  const [result, setResult] = useState<AnalysisExportResult | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const generate = async (c: ChartConfig) => {
    setBusy(true);
    setErr("");
    try {
      const data = await fetchAnalysis(c);
      setResult(data);
      setAppliedConfig(c);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      } catch {
        /* private browsing等で失敗しても致命的ではない */
      }
      setOpen(false);
    } catch {
      setErr("グラフの生成に失敗しました。");
    }
    setBusy(false);
  };

  // 前回保存した設定が復元できていれば、初回マウント時にそのグラフを再生成して表示し続ける。
  useEffect(() => {
    if (typeof window === "undefined") return;
    let hasSaved = false;
    try {
      hasSaved = !!localStorage.getItem(STORAGE_KEY);
    } catch {
      hasSaved = false;
    }
    if (hasSaved) queueMicrotask(() => generate(config));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const points = appliedConfig && result ? pointsFor(appliedConfig, result) : [];
  const range = appliedConfig ? presetRange(appliedConfig.preset, appliedConfig.customFrom, appliedConfig.customTo) : null;

  return (
    <>
      <button className="mf-fab" style={{ right: "auto", left: 18 }} aria-label="グラフ設定を開く" title="グラフ設定" onClick={() => setOpen(true)}>
        📊
      </button>

      {open && (
        <div className="mf-modalbackdrop" onClick={() => setOpen(false)}>
          <div className="mf-modalcard" onClick={(e) => e.stopPropagation()}>
            <div className="mf-modaltitle">グラフ設定</div>
            <div className="mf-modalsub">切り口・グラフの種類・期間・フィルターを選んで「生成する」を押すと、下にグラフが表示されます。</div>

            <div className="mf-quicklabel">切り口</div>
            <div className="mf-chips">
              {(Object.keys(DIMENSION_LABEL) as Dimension[]).map((d) => (
                <button
                  key={d}
                  className={"mf-chipbtn" + (config.dimension === d ? " on" : "")}
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      dimension: d,
                      chartType: CHART_TYPES_FOR[d].includes(c.chartType) ? c.chartType : CHART_TYPES_FOR[d][0],
                    }))
                  }
                >
                  {DIMENSION_LABEL[d]}
                </button>
              ))}
            </div>

            <div className="mf-quicklabel">グラフの種類</div>
            <div className="mf-chips">
              {CHART_TYPES_FOR[config.dimension].map((t) => (
                <button key={t} className={"mf-chipbtn" + (config.chartType === t ? " on" : "")} onClick={() => setConfig((c) => ({ ...c, chartType: t }))}>
                  {CHART_TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            {config.dimension === "monthly" && (
              <>
                <div className="mf-quicklabel">データ（複数選択可）</div>
                <div className="mf-chips">
                  {MONTHLY_METRICS.map((m) => (
                    <button
                      key={m.id}
                      className={"mf-chipbtn" + (config.metrics.includes(m.id) ? " on" : "")}
                      onClick={() => setConfig((c) => ({ ...c, metrics: toggleInArray(c.metrics, m.id) }))}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="mf-quicklabel">期間</div>
            <div className="mf-chips">
              {PRESETS.map(([id, label]) => (
                <button key={id} className={"mf-chipbtn" + (config.preset === id ? " on" : "")} onClick={() => setConfig((c) => ({ ...c, preset: id }))}>
                  {label}
                </button>
              ))}
            </div>
            {config.preset === "custom" && (
              <div className="mf-row">
                <input className="mf-input" type="date" value={config.customFrom} onChange={(e) => setConfig((c) => ({ ...c, customFrom: e.target.value }))} />
                <span className="mf-numsub">〜</span>
                <input className="mf-input" type="date" value={config.customTo} onChange={(e) => setConfig((c) => ({ ...c, customTo: e.target.value }))} />
              </div>
            )}

            <div className="mf-quicklabel">口座（未選択で全口座）</div>
            <div className="mf-chips">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  className={"mf-chipbtn" + (config.accountIds.includes(a.id) ? " on" : "")}
                  onClick={() => setConfig((c) => ({ ...c, accountIds: toggleInArray(c.accountIds, a.id) }))}
                >
                  <span className="mf-dot" style={{ background: a.color }} />
                  {a.name.replace(/（.*）/, "")}
                </button>
              ))}
            </div>

            <div className="mf-quicklabel">カテゴリ（未選択で全カテゴリ）</div>
            <div className="mf-chips">
              {allCats.map((c2) => (
                <button
                  key={c2}
                  className={"mf-chipbtn" + (config.categories.includes(c2) ? " on" : "")}
                  onClick={() => setConfig((c) => ({ ...c, categories: toggleInArray(c.categories, c2) }))}
                >
                  {c2}
                </button>
              ))}
            </div>

            <div className="mf-quicklabel">対象</div>
            <div className="mf-chips">
              <button className={"mf-chipbtn" + (config.owner === "all" ? " on" : "")} onClick={() => setConfig((c) => ({ ...c, owner: "all" }))}>
                世帯全体
              </button>
              <button className={"mf-chipbtn" + (config.owner === "me" ? " on" : "")} onClick={() => setConfig((c) => ({ ...c, owner: "me" }))}>
                自分のみ
              </button>
            </div>

            {err && (
              <div className="mf-hint" style={{ color: "#F26D5F" }}>
                {err}
              </div>
            )}

            <div className="mf-row" style={{ marginTop: 14 }}>
              <button
                className="mf-btn primary"
                disabled={busy || (config.dimension === "monthly" && config.metrics.length === 0)}
                onClick={() => generate(config)}
              >
                {busy ? "生成中…" : "生成する"}
              </button>
              <button className="mf-btn ghost" onClick={() => setOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {appliedConfig && result && (
        <div className="mf-panel">
          <div className="mf-paneltitle">{DIMENSION_LABEL[appliedConfig.dimension]}グラフ</div>
          <div className="mf-hint" style={{ opacity: 0.6, marginTop: 0 }}>
            {range?.from} 〜 {range?.to} ／ {appliedConfig.owner === "me" ? "自分のみ" : "世帯全体"}
          </div>
          {points.length === 0 ? (
            <div className="mf-empty">この条件のデータがありません。</div>
          ) : (
            <div style={{ height: 280 }}>
              <ResponsiveContainer>{renderChart(appliedConfig, points)}</ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </>
  );
}
