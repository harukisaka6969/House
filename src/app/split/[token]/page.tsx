"use client";

import { useEffect, useState, use as usePromise } from "react";
import { apiGet, apiPost, apiDelete, ApiClientError } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import type { SplitEventDetailOut } from "@/lib/apiTypes";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SplitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const [data, setData] = useState<SplitEventDetailOut | null>(null);
  const [error, setError] = useState("");
  const [newParticipant, setNewParticipant] = useState("");
  const [participantBusy, setParticipantBusy] = useState(false);

  const [form, setForm] = useState<{ amount: string; memo: string; date: string; payerId: string; beneficiaryIds: string[] }>({
    amount: "",
    memo: "",
    date: todayStr(),
    payerId: "",
    beneficiaryIds: [],
  });
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => {
    apiGet<SplitEventDetailOut>(`/api/split/${token}`)
      .then((r) => {
        setData(r);
        setError("");
        setForm((f) => ({
          ...f,
          payerId: f.payerId && r.participants.some((p) => p.id === f.payerId) ? f.payerId : r.participants[0]?.id ?? "",
          beneficiaryIds: f.beneficiaryIds.length ? f.beneficiaryIds.filter((id) => r.participants.some((p) => p.id === id)) : r.participants.map((p) => p.id),
        }));
      })
      .catch((e) => setError(e instanceof ApiClientError && e.status === 404 ? "このリンクは無効です。" : "読み込みに失敗しました。"));
  };
  useEffect(load, [token]);

  const addParticipant = async () => {
    if (!newParticipant.trim() || participantBusy) return;
    setParticipantBusy(true);
    try {
      await apiPost(`/api/split/${token}/participants`, { name: newParticipant.trim() });
      setNewParticipant("");
      load();
    } catch {
      setMsg("参加者の追加に失敗しました。");
    }
    setParticipantBusy(false);
  };

  const toggleBeneficiary = (id: string) => {
    setForm((f) => ({
      ...f,
      beneficiaryIds: f.beneficiaryIds.includes(id) ? f.beneficiaryIds.filter((b) => b !== id) : [...f.beneficiaryIds, id],
    }));
  };

  const addExpense = async () => {
    if (!form.amount || Number(form.amount) <= 0 || !form.payerId || form.beneficiaryIds.length === 0 || expenseBusy) {
      setMsg("金額・支払った人・誰のためかをすべて入力してください。");
      return;
    }
    setExpenseBusy(true);
    setMsg("");
    try {
      await apiPost(`/api/split/${token}/expenses`, {
        payerId: form.payerId,
        beneficiaryIds: form.beneficiaryIds,
        amount: Number(form.amount),
        memo: form.memo,
        date: form.date,
      });
      setForm((f) => ({ ...f, amount: "", memo: "" }));
      load();
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : "登録に失敗しました。");
    }
    setExpenseBusy(false);
  };

  const removeExpense = async (id: string) => {
    await apiDelete(`/api/split/${token}/expenses/${id}`);
    load();
  };

  if (error) {
    return (
      <div className="mf-root">
        <main className="mf-main">
          <div className="mf-empty" style={{ padding: 40, textAlign: "center" }}>
            {error}
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mf-root">
        <main className="mf-main">
          <div className="mf-empty" style={{ padding: 40, textAlign: "center" }}>
            読み込み中…
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mf-root">
      <header className="mf-header">
        <div>
          <div className="mf-eyebrow">SPLIT THE BILL</div>
          <h1 className="mf-title">{data.event.name}</h1>
        </div>
      </header>

      <main className="mf-main">
        <section className="mf-section">
          <div className="mf-panel">
            <div className="mf-paneltitle">参加者</div>
            <div className="mf-chips">
              {data.participants.map((p) => (
                <span key={p.id} className="mf-chipbtn on" style={{ cursor: "default" }}>
                  {p.name}
                </span>
              ))}
            </div>
            <div className="mf-row" style={{ marginTop: 10 }}>
              <input
                className="mf-input"
                style={{ flex: 1 }}
                placeholder="参加者の名前を追加"
                value={newParticipant}
                onChange={(e) => setNewParticipant(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addParticipant()}
              />
              <button className="mf-btn ghost" disabled={participantBusy || !newParticipant.trim()} onClick={addParticipant}>
                追加
              </button>
            </div>
          </div>

          {data.participants.length === 0 ? (
            <div className="mf-empty" style={{ marginTop: 12 }}>
              まず上で参加者を追加してください。
            </div>
          ) : (
            <div className="mf-panel">
              <div className="mf-paneltitle">支出を登録</div>
              <div className="mf-formgrid">
                <div>
                  <label className="mf-fieldlabel required">金額（円）</label>
                  <input
                    className="mf-input mf-mono"
                    type="number"
                    placeholder="例: 3000"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mf-fieldlabel">日付</label>
                  <input className="mf-input" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="mf-fieldlabel required">支払った人</label>
                  <select className="mf-input" value={form.payerId} onChange={(e) => setForm((f) => ({ ...f, payerId: e.target.value }))}>
                    {data.participants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mf-fieldlabel">メモ（任意）</label>
                  <input className="mf-input" placeholder="例: 夕食代" value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="mf-fieldlabel required" style={{ margin: "0 0 6px" }}>
                  誰のための支出か（複数選択可）
                </div>
                <div className="mf-chips">
                  {data.participants.map((p) => (
                    <button
                      key={p.id}
                      className={"mf-chipbtn" + (form.beneficiaryIds.includes(p.id) ? " on" : "")}
                      onClick={() => toggleBeneficiary(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mf-row" style={{ marginTop: 10 }}>
                <button className="mf-btn primary" disabled={expenseBusy} onClick={addExpense}>
                  登録する
                </button>
              </div>
              {msg && <div className="mf-hint">{msg}</div>}
            </div>
          )}

          {data.expenses.length > 0 && (
            <div className="mf-panel">
              <div className="mf-paneltitle">支出一覧（{data.expenses.length}件）</div>
              <div className="mf-list" style={{ maxHeight: "none" }}>
                {data.expenses.map((e) => (
                  <div key={e.id} className="mf-listrow">
                    <span className="mf-mono mf-listdate">{e.date.slice(5)}</span>
                    <span className="mf-listcat">{e.payerName}が支払い</span>
                    <span className="mf-listmemo">
                      {e.memo && `${e.memo} ／ `}
                      {e.beneficiaryNames.join("・")}の分
                    </span>
                    <span className="mf-mono mf-listamt">{fmt(e.amount)}</span>
                    <button className="mf-del" onClick={() => removeExpense(e.id)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.balances.length > 0 && (
            <div className="mf-panel">
              <div className="mf-paneltitle">収支</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                {data.balances.map((b) => (
                  <div key={b.participantId} className="mf-row" style={{ justifyContent: "space-between", background: "#101418", borderRadius: 8, padding: "6px 10px" }}>
                    <span>{b.name}</span>
                    <b className="mf-mono" style={{ color: b.net >= 0 ? "#45C48F" : "#F26D5F" }}>
                      {b.net >= 0 ? "+" : ""}
                      {fmt(b.net)}
                    </b>
                  </div>
                ))}
              </div>

              <div className="mf-paneltitle" style={{ marginTop: 14 }}>
                精算方法
              </div>
              {data.settlement.length === 0 ? (
                <div className="mf-hint" style={{ margin: 0 }}>
                  精算は不要です（全員の収支が0です）。
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {data.settlement.map((t, i) => (
                    <div key={i} className="mf-row" style={{ justifyContent: "space-between", background: "#101418", borderRadius: 8, padding: "8px 12px" }}>
                      <span>
                        {t.from} → {t.to}
                      </span>
                      <b className="mf-mono">{fmt(t.amount)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
        <footer className="mf-footer">このページはリンクを知っている人なら誰でも閲覧・編集できます。</footer>
      </main>
    </div>
  );
}
