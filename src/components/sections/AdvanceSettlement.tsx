"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";

interface CycleView {
  key: string;
  from: string;
  to: string;
  confirmDate: string;
  settleFrom: string;
  settleTo: string;
  paymentDate: string;
  status: "confirmed" | "pending" | "current";
  total: number;
  people: { profileId: string; name: string; total: number; count: number; byAccount: { accountId: string; name: string; amount: number }[] }[];
  /** 誰から誰にいくら払えば清算できるか（相殺後）。差し引き0円ならnull。 */
  transfer: { fromName: string; toName: string; amount: number } | null;
  settled: { settledAt: string; settledByName: string | null; amounts: Record<string, number> } | null;
}

interface AdvanceSettlementResponse {
  today: string;
  confirmed: CycleView[];
  pending: CycleView | null;
  current: CycleView;
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const cycleLabel = (c: CycleView) => `${Number(c.key.slice(5, 7))}月締め（${md(c.from)}〜${md(c.to)}）`;

function PeopleTotals({ cycle }: { cycle: CycleView }) {
  return (
    <div style={{ marginTop: 6 }}>
      {cycle.people.map((p) => (
        <div key={p.profileId} style={{ marginBottom: 4 }}>
          <div className="mf-row" style={{ justifyContent: "space-between" }}>
            <span>{p.name}の立替</span>
            <span className="mf-mono" style={{ fontWeight: 600 }}>
              {fmt(p.total)}（{p.count}件）
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** エポスカードの請求サイクルに合わせた立替額と、確定した月の清算状況。ホームのお金パネルの下に出す。 */
export default function AdvanceSettlement() {
  const [data, setData] = useState<AdvanceSettlementResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet<AdvanceSettlementResponse>("/api/advance-settlement").then(setData).catch(() => setErr("立替の集計を読み込めませんでした。"));
  }, []);

  const toggle = async (cycle: CycleView, settled: boolean) => {
    const what = cycle.transfer ? `${cycle.transfer.fromName}から${cycle.transfer.toName}に ${fmt(cycle.transfer.amount)}` : "立替";
    if (settled && !window.confirm(`${cycleLabel(cycle)}の${what}を清算済みにしますか？`)) return;
    setBusy(cycle.key);
    setErr("");
    try {
      setData(await apiPost<AdvanceSettlementResponse>("/api/advance-settlement", { cycle: cycle.key, settled }));
    } catch {
      setErr("更新に失敗しました。もう一度お試しください。");
    }
    setBusy(null);
  };

  if (!data) return err ? <div className="mf-panel mf-empty">{err}</div> : null;

  // 最新の確定サイクルは常に、それより前は清算し忘れ（未清算で立替あり）のときだけ表示する。
  const [latest, ...older] = data.confirmed;
  const shown = [...older.filter((c) => !c.settled && c.total > 0).reverse(), latest];

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">💳 立替の清算（エポスカードの請求サイクル）</div>

      {shown.map((c) => {
        const inSettleWeek = data.today >= c.settleFrom && data.today <= c.settleTo;
        const overdue = !c.settled && c.total > 0 && data.today > c.settleTo;
        return (
          <div key={c.key} style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8, marginTop: 8 }}>
            <div className="mf-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>{cycleLabel(c)}</span>
              <span className="mf-statsub">
                確定 {md(c.confirmDate)}・清算 {md(c.settleFrom)}〜{md(c.settleTo)}・引落し {md(c.paymentDate)}
              </span>
            </div>
            <PeopleTotals cycle={c} />
            {c.total > 0 && (
              <div className="mf-row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                {/* 共通の支出は半分ずつ、相手の支出は全額を相手が負担するとして相殺した金額。 */}
                <span>{c.transfer ? `${c.transfer.fromName}から${c.transfer.toName}に` : "清算額"}</span>
                <span className="mf-mono" style={{ fontWeight: 700 }}>{c.transfer ? fmt(c.transfer.amount) : "0円（相殺済み）"}</span>
              </div>
            )}
            {c.settled ? (
              <div className="mf-row" style={{ justifyContent: "space-between", marginTop: 8, gap: 8 }}>
                <span style={{ color: "#45C48F" }}>
                  ✅ 清算済み（{md(c.settled.settledAt.slice(0, 10))}
                  {c.settled.settledByName ? `・${c.settled.settledByName}` : ""}）
                </span>
                <button className="mf-btn ghost" disabled={busy === c.key} onClick={() => toggle(c, false)}>
                  取り消す
                </button>
              </div>
            ) : c.total > 0 ? (
              <>
                {(inSettleWeek || overdue) && (
                  <div className="mf-statsub" style={{ marginTop: 6, color: overdue ? "#F26D5F" : undefined }}>
                    {overdue ? "⚠️ 清算予定の週を過ぎています。" : "📅 今週が清算の週です。"}
                  </div>
                )}
                <button className="mf-btn primary" style={{ width: "100%", marginTop: 8 }} disabled={busy === c.key} onClick={() => toggle(c, true)}>
                  {busy === c.key ? "更新中…" : "清算済みにする"}
                </button>
              </>
            ) : (
              <div className="mf-statsub" style={{ marginTop: 6 }}>この期間の立替はありません。</div>
            )}
          </div>
        );
      })}

      {data.pending && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8, marginTop: 8 }}>
          <div className="mf-row" style={{ justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>{cycleLabel(data.pending)}</span>
            <span className="mf-statsub">{md(data.pending.confirmDate)}に確定</span>
          </div>
          <PeopleTotals cycle={data.pending} />
        </div>
      )}

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8, marginTop: 8 }}>
        <div className="mf-row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>今の利用期間：{cycleLabel(data.current)}</span>
          <span className="mf-statsub">集計中</span>
        </div>
        <PeopleTotals cycle={data.current} />
      </div>

      {err && <div className="mf-statsub" style={{ color: "#F26D5F", marginTop: 6 }}>{err}</div>}
    </div>
  );
}
