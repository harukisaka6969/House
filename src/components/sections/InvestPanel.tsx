"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fmt } from "@/lib/judge";
import { CAT_COLORS } from "@/lib/constants";
import { apiDelete, apiPost } from "@/lib/apiClient";
import { TT, fmtTooltip } from "../common";
import { useDashboard } from "../DashboardContext";

export default function InvestPanel() {
  const { month, refreshMonth, me } = useDashboard();
  const meName = me?.profile.name ?? "";
  const [form, setForm] = useState({ date: "", name: "", amount: "", memo: "" });
  const [query, setQuery] = useState("");
  const [research, setResearch] = useState({ busy: false, text: "", err: "" });

  if (!month) return null;
  const { invest } = month.aggregates.monthTotals;

  const perStock = new Map<string, number>();
  month.investments.forEach((iv) => perStock.set(iv.name, (perStock.get(iv.name) ?? 0) + (Number(iv.amount) || 0)));
  const perStockData = [...perStock.entries()].map(([name, value]) => ({ name, value }));

  const addInvest = async () => {
    if (!form.name || !form.amount) return;
    await apiPost("/api/investments", {
      date: form.date || undefined,
      name: form.name,
      amount: Number(form.amount),
      memo: form.memo,
    });
    setForm((f) => ({ ...f, name: "", amount: "", memo: "" }));
    refreshMonth();
  };

  const deleteInvest = async (id: string) => {
    await apiDelete(`/api/investments/${id}`);
    refreshMonth();
  };

  const runResearch = async () => {
    if (!query.trim()) return;
    setResearch({ busy: true, text: "", err: "" });
    try {
      const resp = await apiPost<{ text: string }>("/api/ai/research", { query });
      setResearch({ busy: false, text: resp.text || "結果を取得できませんでした。", err: "" });
    } catch {
      setResearch({ busy: false, text: "", err: "リサーチに失敗しました。もう一度試してください。" });
    }
  };

  const sorted = [...month.investments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <div className="mf-panel">
        <div className="mf-paneltitle">
          投資を記録（今月合計: <span className="mf-mono" style={{ color: "#8B7CF6" }}>{fmt(invest)}</span>）
        </div>
        <div className="mf-formgrid">
          <input className="mf-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <input className="mf-input" placeholder="投資先（銘柄・ETF・投信名）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="mf-input mf-mono" type="number" placeholder="金額" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className="mf-input" placeholder="メモ（NISA枠など）" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" onClick={addInvest}>
            記録する
          </button>
        </div>
      </div>

      <div className="mf-twocol">
        <div className="mf-panel">
          <div className="mf-paneltitle">投資先の内訳</div>
          {perStockData.length === 0 ? (
            <div className="mf-empty">記録するとここに内訳が表示されます。</div>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={perStockData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {perStockData.map((s, i) => (
                      <Cell key={s.name} fill={CAT_COLORS[i % CAT_COLORS.length]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TT} formatter={fmtTooltip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {sorted.length > 0 && (
            <div className="mf-list" style={{ marginTop: 8 }}>
              {sorted.map((iv) => {
                const mine = iv.owner_name === meName;
                return (
                  <div key={iv.id} className="mf-listrow">
                    <span className="mf-mono mf-listdate">{iv.date.slice(5)}</span>
                    <span className="mf-listcat">{iv.name}</span>
                    {!mine && <span className="mf-ownerchip">{iv.owner_name}</span>}
                    <span className="mf-listmemo">{iv.memo}</span>
                    <span className="mf-mono mf-listamt">{fmt(iv.amount)}</span>
                    {mine ? (
                      <button className="mf-del" onClick={() => deleteInvest(iv.id)}>
                        ×
                      </button>
                    ) : (
                      <span className="mf-del" style={{ cursor: "default", opacity: 0.3 }} title="相手の記録は削除できません">
                        ·
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mf-panel">
          <div className="mf-paneltitle">銘柄・テーマをリサーチ（Web検索）</div>
          <div className="mf-row">
            <input
              className="mf-input"
              style={{ flex: 1 }}
              placeholder="例: 高配当ETF / 半導体関連 / 新NISAで積立できるインデックス"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="mf-btn primary" disabled={research.busy} onClick={runResearch}>
              {research.busy ? "調査中…" : "調べる"}
            </button>
          </div>
          {research.err && (
            <div className="mf-hint" style={{ color: "#F26D5F" }}>
              {research.err}
            </div>
          )}
          {research.busy && <div className="mf-hint">Webを検索してまとめています。少し時間がかかります…</div>}
          {research.text && <div className="mf-research">{research.text}</div>}
          <div className="mf-hint" style={{ opacity: 0.7 }}>
            参考情報です。投資判断はご自身で。
          </div>
        </div>
      </div>
    </>
  );
}
