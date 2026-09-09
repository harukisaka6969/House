"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { TT } from "../common";
import { apiGet } from "@/lib/apiClient";
import { todayStrJST, addDaysStr, dayOfWeek } from "@/lib/date";
import type { PersonalRecordOut, GymLogOut, GymExerciseOut, GymSplitOut, GymSetEntry } from "@/lib/apiTypes";

const HEADLINE_LABELS = ["体重", "体脂肪率", "筋肉量"] as const;
const HEADLINE_COLORS: Record<string, string> = { 体重: "#3987e5", 体脂肪率: "#d95926", 筋肉量: "#199e70" };
/** 部位別トレーニング量の棒色（dataviz skillの参照パレット。split順で固定割当、フィルタで振り直さない）。 */
const PART_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

type PeriodId = "1m" | "3m" | "6m" | "1y" | "all";
const PERIODS: { id: PeriodId; label: string; days: number | null }[] = [
  { id: "1m", label: "1ヶ月", days: 30 },
  { id: "3m", label: "3ヶ月", days: 90 },
  { id: "6m", label: "6ヶ月", days: 182 },
  { id: "1y", label: "1年", days: 365 },
  { id: "all", label: "全期間", days: null },
];

function leadingNumber(value: string): number | null {
  const m = value.match(/^-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function fmtDateShort(d: string): string {
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d;
}

/** YYYY-MM-DDを「1970-01-01からの経過日数」に変換する。折れ線グラフのX軸を実際の日付間隔に
 * 比例させる（記録の間隔が空いている期間は詰めずにその分だけ間延びして見える）ために使う。 */
function dateToDayNumber(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day) / 86400000;
}

function dayNumberToShortLabel(t: number): string {
  const d = new Date(t * 86400000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 同じ項目が複数回に分けて記録されることがあるため、日付→作成日時の新しい順に探して最新値を拾う。 */
function findLatest(records: PersonalRecordOut[], label: string): { raw: string; num: number | null } | null {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  for (const r of sorted) {
    const m = r.metrics.find((mm) => mm.label === label);
    if (m) return { raw: m.value, num: leadingNumber(m.value) };
  }
  return null;
}

/** 小さな増減も見えるように、Y軸の下限を0固定にせずデータの範囲に合わせて拡大する。 */
function computeDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = range > 0 ? range * 0.25 : Math.max(Math.abs(max) * 0.05, 0.5);
  const round = (n: number) => Math.round(n * 100) / 100;
  return [round(min - pad), round(max + pad)];
}

type Point = { date: string; t: number; value: number; raw: string; trend?: number };

function buildSeries(records: PersonalRecordOut[], label: string, cutoff: string | null): Point[] {
  const ascending = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const filtered = cutoff ? ascending.filter((r) => r.date >= cutoff) : ascending;
  const points = filtered
    .map((r) => {
      const m = r.metrics.find((mm) => mm.label === label);
      const value = m ? leadingNumber(m.value) : null;
      return m && value !== null ? { date: fmtDateShort(r.date), t: dateToDayNumber(r.date), value, raw: m.value } : null;
    })
    .filter((p): p is Point => p !== null);
  return withTrend(points);
}

/** 最小二乗法で(t, value)の回帰直線を求め、各点にtrend（その時点での回帰直線上の値）を付加する。
 * 日々のブレに埋もれがちな全体の傾きを見えるようにするための、点線トレンドライン用。 */
function withTrend(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const n = points.length;
  const meanT = points.reduce((s, p) => s + p.t, 0) / n;
  const meanV = points.reduce((s, p) => s + p.value, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.value - meanV);
    den += (p.t - meanT) ** 2;
  }
  if (den === 0) return points;
  const slope = num / den;
  const intercept = meanV - slope * meanT;
  return points.map((p) => ({ ...p, trend: Math.round((slope * p.t + intercept) * 100) / 100 }));
}

/** アイソレーション種目の自己ベストとして追跡する種目名（gym_exercises.nameと完全一致・大文字小文字は無視）。 */
const TRACKED_EXERCISES = ["Isolateral BP", "Isolateral DY Row", "Incline DB Curl"] as const;
const ISOLATION_COLORS: Record<string, string> = { "Isolateral BP": "#c98500", "Isolateral DY Row": "#d55181", "Incline DB Curl": "#9085e9" };

/** 種目名（完全一致）で、セッション（日）ごとの最大セット総重量（重量×レップ数）の推移を返す。
 * 単発の自己ベスト値だけでは伸びが分からないため、他の記録と同じミニ折れ線＋トレンドラインで見せる。 */
function buildVolumeHistory(logs: GymLogOut[], exercises: GymExerciseOut[], exerciseName: string, cutoff: string | null): Point[] {
  const target = exerciseName.trim().toLowerCase();
  const ids = new Set(exercises.filter((e) => e.name.trim().toLowerCase() === target).map((e) => e.id));
  if (ids.size === 0) return [];
  const bestByDate = new Map<string, number>();
  for (const log of logs) {
    if (!ids.has(log.exercise_id)) continue;
    if (cutoff && log.date < cutoff) continue;
    for (const set of log.sets) {
      if (!Number.isFinite(set.weight) || !Number.isFinite(set.reps) || set.weight <= 0 || set.reps <= 0) continue;
      const volume = set.weight * set.reps;
      if (volume > (bestByDate.get(log.date) ?? 0)) bestByDate.set(log.date, volume);
    }
  }
  const points = [...bestByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date: fmtDateShort(date), t: dateToDayNumber(date), value, raw: `${Math.round(value).toLocaleString("ja-JP")}kg` }));
  return withTrend(points);
}

/** dateStr（YYYY-MM-DD）を含む週の月曜日を返す。 */
function mondayOf(dateStr: string): string {
  const daysSinceMonday = (dayOfWeek(dateStr) + 6) % 7;
  return addDaysStr(dateStr, -daysSinceMonday);
}

function fmtWeekLabel(start: string, end: string, offset: number): string {
  const range = `${fmtDateShort(start)}〜${fmtDateShort(end)}`;
  if (offset === 0) return `今週（${range}）`;
  if (offset === 1) return `先週（${range}）`;
  return `${offset}週間前（${range}）`;
}

function setVolume(sets: GymSetEntry[]): number {
  return sets.reduce((sum, s) => (Number.isFinite(s.weight) && Number.isFinite(s.reps) ? sum + s.weight * s.reps : sum), 0);
}

interface PartWeekEntry {
  date: string;
  exerciseName: string;
  sets: GymSetEntry[];
}

/** 1週間分のログを、種目が属するスプリット（=部位分割）ごとに集計する。有酸素運動（type: cardio）は
 * 重量記録が無いため対象外。 */
function computePartWeekData(logs: GymLogOut[], exercises: GymExerciseOut[], weekStart: string, weekEnd: string): Map<string, { volume: number; entries: PartWeekEntry[] }> {
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const result = new Map<string, { volume: number; entries: PartWeekEntry[] }>();
  for (const log of logs) {
    if (log.date < weekStart || log.date > weekEnd) continue;
    const ex = exerciseById.get(log.exercise_id);
    if (!ex || ex.type !== "strength") continue;
    const vol = setVolume(log.sets);
    if (vol <= 0) continue;
    const cur = result.get(ex.split_id) ?? { volume: 0, entries: [] };
    cur.volume += vol;
    cur.entries.push({ date: log.date, exerciseName: ex.name, sets: log.sets });
    result.set(ex.split_id, cur);
  }
  return result;
}

interface PartCycleStat {
  splitId: string;
  label: string;
  color: string;
  current: number;
  previous: number;
  /** 前サイクル比の変化率(%)。前サイクルの記録が無ければnull（今回が初回か、両方0か）。 */
  deltaPct: number | null;
  history: { weekStart: string; volume: number }[];
  entries: PartWeekEntry[];
}

const HISTORY_WEEKS = 8;

/** 部位ごとに「今サイクル・前サイクル」の総挙上量を比較し、あわせて直近HISTORY_WEEKS分の推移も返す。
 * さらに、記録が両サイクルにある部位だけを対象にした前週比%の平均を「成長指数」として週ごとに算出する
 * （新規に始めた部位や記録が無い週はノイズになるため対象から除く）。 */
function analyzeGymHistory(
  logs: GymLogOut[],
  exercises: GymExerciseOut[],
  splits: GymSplitOut[],
  weekStart: string
): { partStats: PartCycleStat[]; growthHistory: { weekStart: string; index: number | null }[]; growthIndex: number | null } {
  const activeSplits = [...splits].sort((a, b) => a.sort - b.sort).filter((s) => exercises.some((e) => e.split_id === s.id && e.type === "strength"));
  const weekStarts: string[] = [];
  for (let i = HISTORY_WEEKS - 1; i >= 0; i--) weekStarts.push(addDaysStr(weekStart, -7 * i));
  const weekMaps = weekStarts.map((s) => computePartWeekData(logs, exercises, s, addDaysStr(s, 6)));
  const currentMap = weekMaps[weekMaps.length - 1];
  const prevMap = weekMaps[weekMaps.length - 2];

  const partStats: PartCycleStat[] = activeSplits
    .map((s, idx) => {
      const current = currentMap.get(s.id)?.volume ?? 0;
      const previous = prevMap.get(s.id)?.volume ?? 0;
      const entries = currentMap.get(s.id)?.entries ?? [];
      const deltaPct = previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
      const history = weekStarts.map((ws, i) => ({ weekStart: ws, volume: weekMaps[i].get(s.id)?.volume ?? 0 }));
      return { splitId: s.id, label: s.label, color: PART_COLORS[idx % PART_COLORS.length], current, previous, deltaPct, history, entries };
    })
    .sort((a, b) => b.current - a.current);

  const growthHistory: { weekStart: string; index: number | null }[] = [];
  for (let i = 1; i < weekMaps.length; i++) {
    const changes: number[] = [];
    for (const s of activeSplits) {
      const prev = weekMaps[i - 1].get(s.id)?.volume ?? 0;
      const cur = weekMaps[i].get(s.id)?.volume ?? 0;
      if (prev > 0) changes.push(((cur - prev) / prev) * 100);
    }
    growthHistory.push({
      weekStart: weekStarts[i],
      index: changes.length > 0 ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10 : null,
    });
  }
  const growthIndex = growthHistory[growthHistory.length - 1]?.index ?? null;

  return { partStats, growthHistory, growthIndex };
}

function fmtDeltaBadge(deltaPct: number | null, current: number): { text: string; color: string } {
  if (deltaPct === null) return current > 0 ? { text: "🆕 初回", color: "#93A0AE" } : { text: "記録なし", color: "#93A0AE" };
  if (deltaPct === 0) return { text: "±0%", color: "#93A0AE" };
  const up = deltaPct > 0;
  return { text: `${up ? "▲" : "▼"}${Math.abs(deltaPct)}%`, color: up ? "#3DDC97" : "#F26D5F" };
}

/** 点＋実線＋回帰直線の点線トレンドラインからなるミニ折れ線チャート。体組成の推移・種目の自己ベスト
 * 推移など、日付軸のPoint配列を見せる箇所で共通利用する。headlineMode="max"は「直近値」ではなく
 * 「期間内の最大値」を見出しの数値にする（筋トレの自己ベストは直近セッションが最新値とは限らないため）。 */
function MiniTrendChart({
  label,
  color,
  points,
  headlineMode = "last",
  positiveIsGood = false,
}: {
  label: string;
  color: string;
  points: Point[];
  headlineMode?: "last" | "max";
  positiveIsGood?: boolean;
}) {
  const first = points[0];
  const last = points[points.length - 1];
  const headline = headlineMode === "max" ? points.reduce((m, p) => (p.value > m.value ? p : m), points[0]) : last;
  const diff = Math.round((headline.value - first.value) * 100) / 100;
  const diffIsUp = diff > 0;
  const diffColor = (positiveIsGood ? diffIsUp : !diffIsUp) ? "#3DDC97" : "#F26D5F";
  const domain = computeDomain(points.flatMap((p) => (p.trend !== undefined ? [p.value, p.trend] : [p.value])));

  return (
    <div style={{ background: "#101418", borderRadius: 10, padding: "10px 10px 4px" }}>
      <div className="mf-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="mf-hint" style={{ margin: 0 }}>
          {label}
        </span>
        <span className="mf-row" style={{ gap: 6 }}>
          <b className="mf-mono">{headline.raw}</b>
          {points.length >= 2 && diff !== 0 && (
            <span className="mf-hint" style={{ margin: 0, color: diffColor }}>
              {diffIsUp ? "▲" : "▼"}
              {Math.abs(diff)}
            </span>
          )}
        </span>
      </div>
      <div style={{ height: 130, marginTop: 4 }}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={dayNumberToShortLabel}
              stroke="#93A0AE"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis domain={domain} stroke="#93A0AE" fontSize={10} tickLine={false} axisLine={false} width={38} tickCount={3} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.15)" }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const point = payload[0]?.payload as Point | undefined;
                if (!point) return null;
                return (
                  <div style={TT}>
                    <div style={{ opacity: 0.7, marginBottom: 2 }}>{point.date}</div>
                    <b>{point.raw}</b>
                  </div>
                );
              }}
            />
            {points.length >= 2 && (
              <Line type="linear" dataKey="trend" stroke={color} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.55} dot={false} isAnimationActive={false} />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              dot={{ r: 4, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** 体組成カテゴリ専用の一画面ダッシュボード。体重・体脂肪率・筋肉量は下限0固定にしないミニチャートで
 * 小さな変化まで見えるようにし（回帰直線の点線トレンドライン付き）、既存データから計算できる
 * ボディビル向けの参考指標（FFMI、筋トレ記録から拾ったアイソレーション種目の自己ベスト）を追加で表示する。 */
export default function BodyCompositionDashboard({ records }: { records: PersonalRecordOut[] }) {
  const [period, setPeriod] = useState<PeriodId>("3m");
  const [gymLogs, setGymLogs] = useState<GymLogOut[] | null>(null);
  const [gymExercises, setGymExercises] = useState<GymExerciseOut[] | null>(null);
  const [gymSplits, setGymSplits] = useState<GymSplitOut[] | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedSplit, setExpandedSplit] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ logs: GymLogOut[]; exercises: GymExerciseOut[]; splits: GymSplitOut[] }>("/api/gym-log")
      .then((r) => {
        setGymLogs(r.logs);
        setGymExercises(r.exercises);
        setGymSplits(r.splits);
      })
      .catch(() => {
        setGymLogs([]);
        setGymExercises([]);
        setGymSplits([]);
      });
  }, []);

  const weekStart = useMemo(() => mondayOf(addDaysStr(todayStrJST(), -7 * weekOffset)), [weekOffset]);
  const weekEnd = useMemo(() => addDaysStr(weekStart, 6), [weekStart]);
  const analysis = useMemo(
    () => (gymLogs && gymExercises && gymSplits ? analyzeGymHistory(gymLogs, gymExercises, gymSplits, weekStart) : null),
    [gymLogs, gymExercises, gymSplits, weekStart]
  );

  const cutoff = useMemo(() => {
    const opt = PERIODS.find((p) => p.id === period);
    if (!opt || opt.days === null) return null;
    const d = new Date();
    d.setDate(d.getDate() - opt.days);
    return d.toISOString().slice(0, 10);
  }, [period]);

  const headlineSeries = useMemo(
    () =>
      HEADLINE_LABELS.map((label) => ({ label, color: HEADLINE_COLORS[label], points: buildSeries(records, label, cutoff) })).filter(
        (s) => s.points.length > 0
      ),
    [records, cutoff]
  );

  const height = findLatest(records, "身長");
  const lbm = findLatest(records, "除脂肪量");

  const ffmi = useMemo(() => {
    if (!height?.num || height.num <= 0 || !lbm?.num) return null;
    const heightM = height.num / 100;
    const raw = lbm.num / (heightM * heightM);
    const normalized = raw + 6.1 * (1.8 - heightM);
    return { raw: Math.round(raw * 10) / 10, normalized: Math.round(normalized * 10) / 10 };
  }, [height, lbm]);

  const isolationSeries = useMemo(() => {
    if (!gymLogs || !gymExercises) return null;
    return TRACKED_EXERCISES.map((name) => ({ name, color: ISOLATION_COLORS[name], points: buildVolumeHistory(gymLogs, gymExercises, name, cutoff) })).filter(
      (s) => s.points.length > 0
    );
  }, [gymLogs, gymExercises, cutoff]);

  if (records.length === 0) return null;

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">体組成ダッシュボード</div>
      <div className="mf-chips" style={{ marginTop: 0 }}>
        {PERIODS.map((p) => (
          <button key={p.id} className={"mf-chipbtn" + (period === p.id ? " on" : "")} onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {headlineSeries.length === 0 ? (
        <div className="mf-empty" style={{ marginTop: 8 }}>
          この期間の体重・体脂肪率・筋肉量の記録がありません。
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 10 }}>
          {headlineSeries.map((s) => (
            <MiniTrendChart key={s.label} label={s.label} color={s.color} points={s.points} />
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 320px))", gap: 12, marginTop: 12 }}>
        <div style={{ background: "#101418", borderRadius: 10, padding: 12 }}>
          <div className="mf-hint" style={{ margin: 0 }}>
            FFMI（除脂肪量指数・筋肉量の目安）
          </div>
          {ffmi ? (
            <>
              <div className="mf-statvalue mf-mono">{ffmi.normalized}</div>
              <div className="mf-hint" style={{ margin: "4px 0 0" }}>
                身長補正前: {ffmi.raw}／自然な発達の上限目安は概ね25前後
              </div>
            </>
          ) : (
            <div className="mf-hint" style={{ margin: "6px 0 0" }}>
              身長・除脂肪量の記録が揃うと自動で計算されます。
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="mf-hint" style={{ margin: 0 }}>
          アイソレーション種目 自己ベストの推移（1セットの総重量＝重量×レップ数）
        </div>
        {!isolationSeries ? (
          <div className="mf-hint" style={{ margin: "6px 0 0" }}>
            読み込み中…
          </div>
        ) : isolationSeries.length === 0 ? (
          <div className="mf-hint" style={{ margin: "6px 0 0" }}>
            この期間の{TRACKED_EXERCISES.join("・")}の記録がありません。記録すると自動で表示されます。
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 8 }}>
            {isolationSeries.map((s) => (
              <MiniTrendChart key={s.name} label={s.name} color={s.color} points={s.points} headlineMode="max" positiveIsGood />
            ))}
          </div>
        )}
      </div>

      <div style={{ background: "#101418", borderRadius: 10, padding: 12, marginTop: 12 }}>
        <div className="mf-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="mf-hint" style={{ margin: 0 }}>
            部位別トレーニング成長（前サイクル＝先週比）
          </span>
          <div className="mf-monthnav">
            <button className="mf-iconbtn" style={{ width: 26, height: 26, fontSize: 14 }} onClick={() => setWeekOffset((w) => w + 1)} aria-label="前の週">
              ‹
            </button>
            <span className="mf-monthlabel" style={{ fontSize: 12, fontFamily: "inherit", fontWeight: 400, minWidth: 150 }}>
              {fmtWeekLabel(weekStart, weekEnd, weekOffset)}
            </span>
            <button
              className="mf-iconbtn"
              style={{ width: 26, height: 26, fontSize: 14, opacity: weekOffset === 0 ? 0.4 : 1, cursor: weekOffset === 0 ? "default" : "pointer" }}
              disabled={weekOffset === 0}
              onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
              aria-label="次の週"
            >
              ›
            </button>
          </div>
        </div>

        {!analysis ? (
          <div className="mf-hint" style={{ margin: "6px 0 0" }}>
            読み込み中…
          </div>
        ) : analysis.partStats.length === 0 ? (
          <div className="mf-hint" style={{ margin: "6px 0 0" }}>
            部位ごとの分割（スプリット）で筋トレを記録すると、ここに表示されます。
          </div>
        ) : (
          <>
            <div style={{ marginTop: 8 }}>
              <div className="mf-hint" style={{ margin: 0 }}>
                成長指数（KPI）: 先週も記録がある部位に絞った、総挙上量の前週比の平均
              </div>
              {analysis.growthIndex === null ? (
                <div className="mf-hint" style={{ margin: "4px 0 0" }}>
                  2週続けて同じ部位を記録すると計算されます。
                </div>
              ) : (
                <div className="mf-row" style={{ alignItems: "baseline", gap: 8, marginTop: 4 }}>
                  <span className="mf-statvalue mf-mono" style={{ color: analysis.growthIndex >= 0 ? "#3DDC97" : "#F26D5F" }}>
                    {analysis.growthIndex > 0 ? "+" : ""}
                    {analysis.growthIndex}%
                  </span>
                </div>
              )}
              <div style={{ height: 90, marginTop: 6 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={analysis.growthHistory.map((g) => ({ date: fmtDateShort(g.weekStart), value: g.index }))}
                    margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" stroke="#93A0AE" fontSize={10} tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis
                      domain={computeDomain(analysis.growthHistory.map((g) => g.index).filter((v): v is number => v !== null))}
                      stroke="#93A0AE"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      width={34}
                      tickCount={3}
                    />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                    <Tooltip
                      cursor={{ stroke: "rgba(255,255,255,0.15)" }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const v = payload[0]?.value;
                        if (v === null || v === undefined) return null;
                        return (
                          <div style={TT}>
                            <div style={{ opacity: 0.7, marginBottom: 2 }}>{label}</div>
                            <b>
                              {Number(v) > 0 ? "+" : ""}
                              {v}%
                            </b>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#3987e5"
                      strokeWidth={2}
                      strokeLinecap="round"
                      dot={{ r: 3, fill: "#3987e5", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginTop: 14 }}>
              {analysis.partStats.map((p) => {
                const badge = fmtDeltaBadge(p.deltaPct, p.current);
                const domain = computeDomain(p.history.map((h) => h.volume));
                const chartData = p.history.map((h) => ({ date: fmtDateShort(h.weekStart), value: h.volume }));
                return (
                  <div key={p.splitId} style={{ background: "#181E25", borderRadius: 10, padding: 10 }}>
                    <div className="mf-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                      <span className="mf-hint" style={{ margin: 0 }}>
                        {p.label}
                      </span>
                      <span className="mf-hint" style={{ margin: 0, color: badge.color }}>
                        {badge.text}
                      </span>
                    </div>
                    <div className="mf-mono" style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: p.color }}>
                      {p.current > 0 ? `${Math.round(p.current).toLocaleString("ja-JP")}kg` : "記録なし"}
                    </div>
                    <div className="mf-hint" style={{ margin: "2px 0 0" }}>
                      先週: {p.previous > 0 ? `${Math.round(p.previous).toLocaleString("ja-JP")}kg` : "記録なし"}
                    </div>
                    <div style={{ height: 60, marginTop: 6 }}>
                      <ResponsiveContainer>
                        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <YAxis hide domain={domain} />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke={p.color}
                            strokeWidth={2}
                            strokeLinecap="round"
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {p.entries.length > 0 && (
                      <button
                        className="mf-btn ghost"
                        style={{ marginTop: 6, padding: "3px 10px", fontSize: 11 }}
                        onClick={() => setExpandedSplit((s) => (s === p.splitId ? null : p.splitId))}
                      >
                        {expandedSplit === p.splitId ? "内訳を閉じる" : "内訳を見る"}
                      </button>
                    )}
                    {expandedSplit === p.splitId && p.entries.length > 0 && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                        {p.entries.map((entry, idx) => (
                          <div key={idx} className="mf-hint" style={{ margin: "2px 0" }}>
                            {fmtDateShort(entry.date)} {entry.exerciseName}: {entry.sets.map((s) => `${s.weight}kg×${s.reps}`).join(", ")}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
