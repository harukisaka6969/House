"use client";

import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TT } from "../common";
import type { PersonalRecordOut } from "@/lib/apiTypes";

/** dataviz skillの参照パレット（ダーク面、隣接ペアで検証済み）。各項目は個別のミニチャートに
 * ラベル付きで表示されるため色だけで識別する必要はないが、固定順で割り当てる。 */
const TREND_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

/** カテゴリごとに、グラフ（推移）で表示する項目をここで絞り込む。指定の無いカテゴリは
 * 従来どおり全項目を表示する。指定した以外の項目は記録データとしては残るが、グラフには出さない。 */
const IMPORTANT_METRICS_BY_CATEGORY: Record<string, string[]> = {
  体組成: ["体重", "体脂肪率", "筋肉量"],
};

type PeriodId = "1m" | "3m" | "6m" | "1y" | "all";
const PERIODS: { id: PeriodId; label: string; days: number | null }[] = [
  { id: "1m", label: "1ヶ月", days: 30 },
  { id: "3m", label: "3ヶ月", days: 90 },
  { id: "6m", label: "6ヶ月", days: 182 },
  { id: "1y", label: "1年", days: 365 },
  { id: "all", label: "全期間", days: null },
];

/** 値の先頭にある数値（例: "84.1kg"→84.1）を取り出す。比較不能なら null。 */
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

type Point = { date: string; value: number; raw: string };

/** カテゴリの記録から、項目（metricラベル）ごとの推移を小さな折れ線で並べる。傾向（形）重視で、
 * Y軸の実数値はツールチップでのみ確認できればよい。 */
export default function RecordsTrend({ records }: { records: PersonalRecordOut[] }) {
  const [period, setPeriod] = useState<PeriodId>("3m");

  const ascending = useMemo(() => [...records].sort((a, b) => a.date.localeCompare(b.date)), [records]);
  const importantLabels = IMPORTANT_METRICS_BY_CATEGORY[records[0]?.category ?? ""];

  const labelOrder = useMemo(() => {
    const seen: string[] = [];
    for (const r of ascending) {
      for (const m of r.metrics) {
        if (!m.label.trim() || seen.includes(m.label)) continue;
        if (importantLabels && !importantLabels.includes(m.label)) continue;
        seen.push(m.label);
      }
    }
    return seen;
  }, [ascending, importantLabels]);

  const cutoff = useMemo(() => {
    const opt = PERIODS.find((p) => p.id === period);
    if (!opt || opt.days === null) return null;
    const d = new Date();
    d.setDate(d.getDate() - opt.days);
    return d.toISOString().slice(0, 10);
  }, [period]);

  const filtered = useMemo(() => (cutoff ? ascending.filter((r) => r.date >= cutoff) : ascending), [ascending, cutoff]);

  const series = useMemo(
    () =>
      labelOrder
        .map((label, idx) => {
          const points = filtered
            .map((r) => {
              const m = r.metrics.find((mm) => mm.label === label);
              const value = m ? leadingNumber(m.value) : null;
              return m && value !== null ? { date: fmtDateShort(r.date), value, raw: m.value } : null;
            })
            .filter((p): p is Point => p !== null);
          return { label, color: TREND_COLORS[idx % TREND_COLORS.length], points };
        })
        .filter((s) => s.points.length >= 2),
    [labelOrder, filtered]
  );

  if (labelOrder.length === 0) return null;

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">推移</div>
      <div className="mf-chips" style={{ marginTop: 0 }}>
        {PERIODS.map((p) => (
          <button key={p.id} className={"mf-chipbtn" + (period === p.id ? " on" : "")} onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {series.length === 0 ? (
        <div className="mf-empty" style={{ marginTop: 8 }}>
          この期間に、推移を表示できる項目（同じ項目名で2件以上）がありません。
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 10 }}>
          {series.map((s) => {
            const first = s.points[0];
            const last = s.points[s.points.length - 1];
            const diff = Math.round((last.value - first.value) * 100) / 100;
            return (
              <div key={s.label} style={{ background: "#101418", borderRadius: 10, padding: "10px 10px 4px" }}>
                <div className="mf-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="mf-hint" style={{ margin: 0 }}>
                    {s.label}
                  </span>
                  <span className="mf-row" style={{ gap: 6 }}>
                    <b className="mf-mono">{last.raw}</b>
                    {diff !== 0 && (
                      <span className="mf-hint" style={{ margin: 0, color: diff > 0 ? "#F26D5F" : "#3DDC97" }}>
                        {diff > 0 ? "▲" : "▼"}
                        {Math.abs(diff)}
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ height: 100, marginTop: 4 }}>
                  <ResponsiveContainer>
                    <LineChart data={s.points} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="date" stroke="#93A0AE" fontSize={10} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis hide />
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
    </div>
  );
}
