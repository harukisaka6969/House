"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut, apiPost } from "@/lib/apiClient";
import type { BodyGoalOut, WeeklyBodyReviewOut } from "@/lib/apiTypes";
import { SectionHead } from "../common";

const MUSCLE_TREND_MIN = -2;
const MUSCLE_TREND_MAX = 2;
const MUSCLE_TREND_STEP = 0.1;

function muscleTrendLabel(v: number): string {
  if (v > 0.05) return `4週で+${v.toFixed(1)}kg（増加）`;
  if (v < -0.05) return `4週で${v.toFixed(1)}kg（減少）`;
  return "維持（±0kg）";
}

function scoreColor(score: number): string {
  if (score >= 75) return "#3DDC97";
  if (score >= 50) return "#F5A524";
  return "#F26D5F";
}

const COMPONENT_LABELS: { key: "nutrition" | "training" | "bodyComp"; label: string }[] = [
  { key: "nutrition", label: "🍽 栄養" },
  { key: "training", label: "🏋️ トレーニング" },
  { key: "bodyComp", label: "📈 体組成の進み方" },
];

/** 体組成の目標（体脂肪率・筋肉量の増減ペース）を設定し、過去1週間の実績をその目標に照らして
 * 振り返れるセクション。よく変える2項目（体脂肪率・筋肉量ペース）だけを常に表示し、目標体重・
 * 目標除脂肪量・達成期限は「詳細」を開いたときだけ編集できる。 */
export default function BodyGoal() {
  const [goal, setGoal] = useState<BodyGoalOut | null | undefined>(undefined);
  const [bodyFatTarget, setBodyFatTarget] = useState("");
  const [muscleTrend, setMuscleTrend] = useState(0.15);
  const [showDetail, setShowDetail] = useState(false);
  const [targetWeight, setTargetWeight] = useState("");
  const [targetLbm, setTargetLbm] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [review, setReview] = useState<WeeklyBodyReviewOut | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    apiGet<{ goal: BodyGoalOut | null }>("/api/body-goal")
      .then((r) => {
        setGoal(r.goal);
        if (r.goal) {
          setBodyFatTarget(r.goal.body_fat_pct_target !== null ? String(r.goal.body_fat_pct_target) : "");
          setMuscleTrend(r.goal.muscle_trend_kg_per_4w ?? 0.15);
          setTargetWeight(r.goal.target_weight !== null ? String(r.goal.target_weight) : "");
          setTargetLbm(r.goal.target_lbm !== null ? String(r.goal.target_lbm) : "");
          setTargetDate(r.goal.target_date ?? "");
        }
      })
      .catch(() => setGoal(null));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const { goal: saved } = await apiPut<{ goal: BodyGoalOut }>("/api/body-goal", {
        body_fat_pct_target: bodyFatTarget.trim() ? Number(bodyFatTarget) : null,
        muscle_trend_kg_per_4w: muscleTrend,
        target_weight: targetWeight.trim() ? Number(targetWeight) : null,
        target_lbm: targetLbm.trim() ? Number(targetLbm) : null,
        target_date: targetDate.trim() || null,
      });
      setGoal(saved);
      setMsg("✓ 目標を保存しました。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存に失敗しました。");
    }
    setBusy(false);
  };

  const runReview = async () => {
    setReviewBusy(true);
    setReview(null);
    try {
      const { review: r } = await apiPost<{ review: WeeklyBodyReviewOut }>("/api/body-goal/weekly-review");
      setReview(r);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "振り返りの生成に失敗しました。");
    }
    setReviewBusy(false);
  };

  if (goal === undefined) return <div className="mf-empty">読み込み中…</div>;

  return (
    <section className="mf-section">
      <SectionHead
        no="29"
        title="体の目標"
        sub="体脂肪率と筋肉量の増減ペースを設定します。体の記録を送るたびに、この目標に沿って食事の目標も自動調整されます。"
      />

      <div className="mf-panel">
        <div className="mf-formgrid">
          <div>
            <div className="mf-hint" style={{ margin: "0 0 4px" }}>
              🎯 目標体脂肪率(%)
            </div>
            <input
              className="mf-input mf-mono"
              type="number"
              step="0.1"
              placeholder="例: 20"
              value={bodyFatTarget}
              onChange={(e) => setBodyFatTarget(e.target.value)}
            />
          </div>

          <div>
            <div className="mf-hint" style={{ margin: "0 0 4px" }}>
              💪 筋肉量の目標ペース
            </div>
            <input
              className="mf-slider"
              type="range"
              min={MUSCLE_TREND_MIN}
              max={MUSCLE_TREND_MAX}
              step={MUSCLE_TREND_STEP}
              value={muscleTrend}
              onChange={(e) => setMuscleTrend(Number(e.target.value))}
            />
            <div className="mf-row" style={{ justifyContent: "space-between" }}>
              <span className="mf-hint" style={{ margin: 0 }}>
                減少
              </span>
              <span className="mf-hint" style={{ margin: 0 }}>
                維持
              </span>
              <span className="mf-hint" style={{ margin: 0 }}>
                増加
              </span>
            </div>
            <div className="mf-numsub mf-mono" style={{ textAlign: "center" }}>
              {muscleTrendLabel(muscleTrend)}
            </div>
          </div>
        </div>

        <button className="mf-btn ghost" style={{ marginTop: 10 }} onClick={() => setShowDetail((v) => !v)}>
          {showDetail ? "詳細を閉じる" : "詳細を編集（目標体重・目標除脂肪量・達成期限）"}
        </button>

        {showDetail && (
          <div className="mf-formgrid" style={{ marginTop: 10 }}>
            <input className="mf-input mf-mono" type="number" step="0.1" placeholder="目標体重(kg)" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} />
            <input className="mf-input mf-mono" type="number" step="0.1" placeholder="目標除脂肪量(kg)" value={targetLbm} onChange={(e) => setTargetLbm(e.target.value)} />
            <input className="mf-input mf-mono" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        )}

        <div className="mf-row" style={{ marginTop: 12 }}>
          <button className="mf-btn primary" disabled={busy} onClick={save}>
            {busy ? "保存中…" : "目標を保存"}
          </button>
        </div>
        {msg && <div className="mf-hint">{msg}</div>}
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">過去1週間の振り返り</div>
        <button className="mf-btn primary" disabled={reviewBusy} onClick={runReview}>
          {reviewBusy ? "分析中…" : "📊 今週を振り返る"}
        </button>

        {review && (
          <div style={{ marginTop: 14 }}>
            <div className="mf-row" style={{ alignItems: "baseline", gap: 8 }}>
              <span className="mf-hint" style={{ margin: 0 }}>
                総合スコア
              </span>
              <span className="mf-statvalue mf-mono" style={{ color: scoreColor(review.score) }}>
                {review.score}
              </span>
              <span className="mf-hint" style={{ margin: 0 }}>
                / 100
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 8 }}>
              {COMPONENT_LABELS.map((c) => {
                const v = review.components[c.key];
                return (
                  <div key={c.key} style={{ background: "#101418", borderRadius: 10, padding: 10 }}>
                    <div className="mf-hint" style={{ margin: 0, fontSize: 11 }}>
                      {c.label}
                    </div>
                    <div className="mf-mono" style={{ fontWeight: 700, color: v !== null ? scoreColor(v) : undefined }}>
                      {v !== null ? v : "—"}
                    </div>
                  </div>
                );
              })}
            </div>

            {review.good.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="mf-hint" style={{ margin: "0 0 4px", color: "#3DDC97" }}>
                  👍 良かった点
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {review.good.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}

            {review.improve.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="mf-hint" style={{ margin: "0 0 4px", color: "#F5A524" }}>
                  🔧 改善点
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {review.improve.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="mf-hint" style={{ margin: "0 0 4px", opacity: 0.7 }}>
                根拠データ
              </div>
              {review.facts.map((f, i) => (
                <div key={i} className="mf-hint" style={{ margin: "2px 0" }}>
                  ・{f}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
