"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TT } from "../common";
import { apiGet } from "@/lib/apiClient";
import type { PersonalRecordOut, GymLogOut, GymExerciseOut } from "@/lib/apiTypes";

const HEADLINE_LABELS = ["体重", "体脂肪率", "筋肉量"] as const;
const HEADLINE_COLORS: Record<string, string> = { 体重: "#3987e5", 体脂肪率: "#d95926", 筋肉量: "#199e70" };

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

type Point = { date: string; value: number; raw: string };

function buildSeries(records: PersonalRecordOut[], label: string, cutoff: string | null): Point[] {
  const ascending = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const filtered = cutoff ? ascending.filter((r) => r.date >= cutoff) : ascending;
  return filtered
    .map((r) => {
      const m = r.metrics.find((mm) => mm.label === label);
      const value = m ? leadingNumber(m.value) : null;
      return m && value !== null ? { date: fmtDateShort(r.date), value, raw: m.value } : null;
    })
    .filter((p): p is Point => p !== null);
}

const SQUAT_RE = /(スクワット|squat)/i;
const SQUAT_EXCLUDE_RE = /(カーフ|calf)/i;
const BENCH_RE = /(ベンチプレス|bench)/i;
const DEADLIFT_RE = /(デッドリフト|deadlift)/i;

interface LiftPr {
  weight: number;
  reps: number;
  date: string;
}

/** 種目名でスクワット・ベンチプレス・デッドリフトを判定し、記録中で最も重い重量（実測の自己ベスト。
 * 推定1RMではない）を拾う。 */
function findLiftPr(logs: GymLogOut[], exercises: GymExerciseOut[], re: RegExp, excludeRe?: RegExp): LiftPr | null {
  const ids = new Set(exercises.filter((e) => re.test(e.name) && !(excludeRe && excludeRe.test(e.name))).map((e) => e.id));
  if (ids.size === 0) return null;
  let best: LiftPr | null = null;
  for (const log of logs) {
    if (!ids.has(log.exercise_id)) continue;
    for (const set of log.sets) {
      if (!Number.isFinite(set.weight) || set.weight <= 0) continue;
      if (!best || set.weight > best.weight) best = { weight: set.weight, reps: set.reps, date: log.date };
    }
  }
  return best;
}

/** DOTS係数（男性、公表値で検証済み）。女性係数は出典を確認できなかったため未実装で、性別が
 * 男性と判定できた場合のみDOTSを表示する。 */
const DOTS_MALE = { a: -0.000001093, b: 0.0007391293, c: -0.1918759221, d: 24.0900756, e: -307.75076 };

function dotsScore(totalKg: number, bodyweightKg: number): number | null {
  const bw = bodyweightKg;
  const denom = DOTS_MALE.a * bw ** 4 + DOTS_MALE.b * bw ** 3 + DOTS_MALE.c * bw ** 2 + DOTS_MALE.d * bw + DOTS_MALE.e;
  if (denom <= 0) return null;
  return Math.round(((totalKg * 500) / denom) * 10) / 10;
}

const LIFT_NAMES: Record<"squat" | "bench" | "deadlift", string> = { squat: "スクワット", bench: "ベンチプレス", deadlift: "デッドリフト" };

/** 体組成カテゴリ専用の一画面ダッシュボード。体重・体脂肪率・筋肉量は下限0固定にしないミニチャートで
 * 小さな変化まで見えるようにし、既存データから計算できるボディビル/パワーリフティング向けの参考指標
 * （FFMI、筋トレ記録から拾ったBIG3自己ベストとDOTSスコア）を追加で表示する。 */
export default function BodyCompositionDashboard({ records }: { records: PersonalRecordOut[] }) {
  const [period, setPeriod] = useState<PeriodId>("3m");
  const [gymLogs, setGymLogs] = useState<GymLogOut[] | null>(null);
  const [gymExercises, setGymExercises] = useState<GymExerciseOut[] | null>(null);

  useEffect(() => {
    apiGet<{ logs: GymLogOut[]; exercises: GymExerciseOut[] }>("/api/gym-log")
      .then((r) => {
        setGymLogs(r.logs);
        setGymExercises(r.exercises);
      })
      .catch(() => {
        setGymLogs([]);
        setGymExercises([]);
      });
  }, []);

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
  const gender = findLatest(records, "性別");
  const lbm = findLatest(records, "除脂肪量");
  const weight = findLatest(records, "体重");

  const ffmi = useMemo(() => {
    if (!height?.num || height.num <= 0 || !lbm?.num) return null;
    const heightM = height.num / 100;
    const raw = lbm.num / (heightM * heightM);
    const normalized = raw + 6.1 * (1.8 - heightM);
    return { raw: Math.round(raw * 10) / 10, normalized: Math.round(normalized * 10) / 10 };
  }, [height, lbm]);

  const isMale = gender !== null && gender.raw.includes("男");

  const liftPrs = useMemo(() => {
    if (!gymLogs || !gymExercises) return null;
    return {
      squat: findLiftPr(gymLogs, gymExercises, SQUAT_RE, SQUAT_EXCLUDE_RE),
      bench: findLiftPr(gymLogs, gymExercises, BENCH_RE),
      deadlift: findLiftPr(gymLogs, gymExercises, DEADLIFT_RE),
    };
  }, [gymLogs, gymExercises]);

  const big3Total =
    liftPrs && liftPrs.squat && liftPrs.bench && liftPrs.deadlift ? liftPrs.squat.weight + liftPrs.bench.weight + liftPrs.deadlift.weight : null;
  const dots = big3Total !== null && isMale && weight?.num ? dotsScore(big3Total, weight.num) : null;

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
          {headlineSeries.map((s) => {
            const first = s.points[0];
            const last = s.points[s.points.length - 1];
            const diff = Math.round((last.value - first.value) * 100) / 100;
            const domain = computeDomain(s.points.map((p) => p.value));
            return (
              <div key={s.label} style={{ background: "#101418", borderRadius: 10, padding: "10px 10px 4px" }}>
                <div className="mf-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="mf-hint" style={{ margin: 0 }}>
                    {s.label}
                  </span>
                  <span className="mf-row" style={{ gap: 6 }}>
                    <b className="mf-mono">{last.raw}</b>
                    {s.points.length >= 2 && diff !== 0 && (
                      <span className="mf-hint" style={{ margin: 0, color: diff > 0 ? "#F26D5F" : "#3DDC97" }}>
                        {diff > 0 ? "▲" : "▼"}
                        {Math.abs(diff)}
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ height: 130, marginTop: 4 }}>
                  <ResponsiveContainer>
                    <LineChart data={s.points} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="date" stroke="#93A0AE" fontSize={10} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis domain={domain} stroke="#93A0AE" fontSize={10} tickLine={false} axisLine={false} width={38} tickCount={3} />
                      <Tooltip
                        cursor={{ stroke: "rgba(255,255,255,0.15)" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload || !payload.length) return null;
                          const point = payload[0]?.payload as Point | undefined;
                          if (!point) return null;
                          return (
                            <div style={TT}>
                              <div style={{ opacity: 0.7, marginBottom: 2 }}>{label}</div>
                              <b>{point.raw}</b>
                            </div>
                          );
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={s.color}
                        strokeWidth={2}
                        strokeLinecap="round"
                        dot={{ r: 4, fill: s.color, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
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

        <div style={{ background: "#101418", borderRadius: 10, padding: 12 }}>
          <div className="mf-hint" style={{ margin: 0 }}>
            パワーリフティング PR（BIG3自己ベスト）
          </div>
          {!liftPrs ? (
            <div className="mf-hint" style={{ margin: "6px 0 0" }}>
              読み込み中…
            </div>
          ) : !liftPrs.squat && !liftPrs.bench && !liftPrs.deadlift ? (
            <div className="mf-hint" style={{ margin: "6px 0 0" }}>
              筋トレ記録にスクワット・ベンチプレス・デッドリフトがまだありません。記録すると自動で表示されます。
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 6 }}>
                {(Object.keys(LIFT_NAMES) as (keyof typeof LIFT_NAMES)[]).map((k) => {
                  const pr = liftPrs[k];
                  return (
                    <div key={k}>
                      <div className="mf-hint" style={{ margin: 0, fontSize: 11 }}>
                        {LIFT_NAMES[k]}
                      </div>
                      <div className="mf-mono" style={{ fontWeight: 700 }}>
                        {pr ? `${pr.weight}kg` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
              {big3Total !== null && (
                <div className="mf-hint" style={{ marginTop: 8 }}>
                  BIG3合計: <b className="mf-mono">{big3Total}kg</b>
                  {dots !== null && (
                    <>
                      ／DOTS: <b className="mf-mono">{dots}</b>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
