"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/judge";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { LifeEventOut } from "@/lib/apiTypes";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";
import { nowMonthKeyJST } from "@/lib/date";

const emptyForm = {
  name: "",
  event_year: new Date().getFullYear() + 1,
  event_month: "",
  cost_low: "",
  cost_high: "",
  cost_basis: "",
  monthly_saving: "",
  memo: "",
  visible_to_family: true,
};

function monthsUntil(eventYear: number, eventMonth: number | null): number {
  const [cy, cm] = nowMonthKeyJST().split("-").map(Number);
  const targetMonth = eventMonth ?? 6;
  return Math.max(eventYear * 12 + targetMonth - (cy * 12 + cm), 0);
}

export default function LifeEvents() {
  const { trend } = useDashboard();
  const [events, setEvents] = useState<LifeEventOut[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contributingId, setContributingId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [assumedCost, setAssumedCost] = useState<Record<string, number>>({});

  const load = () => {
    apiGet<{ events: LifeEventOut[] }>("/api/life-events").then((r) => setEvents(r.events)).catch(() => setEvents([]));
  };
  useEffect(load, []);

  if (!events) return <div className="mf-empty">読み込み中…</div>;

  const active = events.filter((e) => e.status === "active").sort((a, b) => a.event_year - b.event_year);
  const recent6 = trend.slice(-6);
  const avgPace = recent6.length ? recent6.reduce((s, t) => s + (t.income - t.expense), 0) / recent6.length : 0;

  const costFor = (e: LifeEventOut) => assumedCost[e.id] ?? Math.round((e.cost_low + e.cost_high) / 2);

  const rows = active.map((e) => {
    const cost = costFor(e);
    const remaining = Math.max(cost - e.funded, 0);
    const months = monthsUntil(e.event_year, e.event_month);
    const requiredMonthly = months > 0 ? Math.ceil(remaining / months) : remaining;
    return { e, cost, remaining, months, requiredMonthly };
  });
  const totalRequiredMonthly = rows.reduce((s, r) => s + (r.e.linked ? r.requiredMonthly : 0), 0);
  const sufficient = avgPace >= totalRequiredMonthly;

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (e: LifeEventOut) => {
    setForm({
      name: e.name,
      event_year: e.event_year,
      event_month: e.event_month ? String(e.event_month) : "",
      cost_low: String(e.cost_low),
      cost_high: String(e.cost_high),
      cost_basis: e.cost_basis,
      monthly_saving: String(e.monthly_saving || ""),
      memo: e.memo,
      visible_to_family: e.visible_to_family,
    });
    setEditingId(e.id);
    setShowForm(true);
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.cost_low || !form.cost_high) return;
    const payload = {
      name: form.name.trim(),
      event_year: Number(form.event_year),
      event_month: form.event_month ? Number(form.event_month) : null,
      cost_low: Number(form.cost_low),
      cost_high: Number(form.cost_high),
      cost_basis: form.cost_basis,
      monthly_saving: Number(form.monthly_saving) || 0,
      memo: form.memo,
      visible_to_family: form.visible_to_family,
    };
    if (editingId) await apiPut(`/api/life-events/${editingId}`, payload);
    else await apiPost("/api/life-events", payload);
    resetForm();
    load();
  };

  const setStatus = async (id: string, status: string) => {
    await apiPut(`/api/life-events/${id}`, { status });
    load();
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/life-events/${id}`);
    load();
  };

  const submitContribute = async (id: string) => {
    if (!contributeAmount) return;
    await apiPost(`/api/life-events/${id}/contribute`, { amount: Number(contributeAmount) });
    setContributingId(null);
    setContributeAmount("");
    load();
  };

  return (
    <section className="mf-section">
      <SectionHead no="09" title="将来設計" sub="子供・家の建て替え等のライフイベント資金計画。世帯共有。" />

      {active.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">タイムライン</div>
          <div className="mf-timeline">
            {active.map((e) => (
              <div key={e.id} className="mf-tlitem">
                <div className="mf-tldot" style={{ width: 10 + Math.min(costFor(e) / 1000000, 20), height: 10 + Math.min(costFor(e) / 1000000, 20) }} />
                <div className="mf-tlyear">{e.event_year}年{e.event_month ? `${e.event_month}月` : ""}</div>
                <div className="mf-tlname">{e.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mf-panel">
        <div className="mf-paneltitle">資金ギャップ</div>
        <div className="mf-tabwrap">
          <div className="mf-tabhead">
            <span>イベント</span>
            <span>必要額</span>
            <span>準備済み</span>
            <span>残り</span>
            <span>残り月数</span>
            <span>必要月額</span>
          </div>
          {rows.map(({ e, cost, remaining, months, requiredMonthly }) => (
            <div key={e.id} className="mf-tabrow">
              <span className="mf-tabname">{e.name}{!e.linked && <span className="mf-numsub"> (未連携)</span>}</span>
              <span className="mf-mono">{fmt(cost)}</span>
              <span className="mf-mono">{fmt(e.funded)}</span>
              <span className="mf-mono">{fmt(remaining)}</span>
              <span className="mf-mono">{months}ヶ月</span>
              <span className="mf-mono">{fmt(requiredMonthly)}</span>
            </div>
          ))}
        </div>
        <div className="mf-row" style={{ marginTop: 10, justifyContent: "space-between" }}>
          <span className="mf-numsub">合計必要月額（連携中のみ）</span>
          <span className="mf-num mf-mono">{fmt(totalRequiredMonthly)}</span>
        </div>
        <div className="mf-hint" style={{ color: sufficient ? "#45C48F" : "#F26D5F" }}>
          {sufficient ? "✓" : "⚠"} 直近6ヶ月の平均貯蓄ペース {fmt(avgPace)} / 月 —
          {sufficient ? " 現在のペースで足りています。" : ` あと ${fmt(totalRequiredMonthly - avgPace)} / 月 不足しています。`}
        </div>
      </div>

      {active.map((e) => (
        <div key={e.id} className="mf-panel">
          <div className="mf-paneltitle">{e.name}</div>
          <div className="mf-numsub">{e.cost_basis}</div>
          <label className="mf-row" style={{ marginTop: 8 }}>
            <span className="mf-numsub" style={{ minWidth: 90 }}>想定費用: {fmt(costFor(e))}</span>
            <input
              type="range"
              min={e.cost_low}
              max={Math.max(e.cost_high, e.cost_low + 1)}
              value={costFor(e)}
              onChange={(ev) => setAssumedCost({ ...assumedCost, [e.id]: Number(ev.target.value) })}
              style={{ flex: 1 }}
            />
          </label>
          <div className="mf-numsub">{fmt(e.cost_low)} 〜 {fmt(e.cost_high)} の範囲で試算</div>
          {e.memo && <div className="mf-numsub" style={{ marginTop: 4 }}>{e.memo}</div>}
          <div className="mf-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
            <button className="mf-btn ghost" onClick={() => startEdit(e)}>
              編集
            </button>
            <button className="mf-btn primary" onClick={() => { setContributingId(e.id); setContributeAmount(""); }}>
              積立を記録
            </button>
            <button className="mf-btn ghost" onClick={() => setStatus(e.id, "done")}>
              完了にする
            </button>
            <button className="mf-btn ghost" onClick={() => setStatus(e.id, "cancelled")}>
              中止する
            </button>
          </div>
          {contributingId === e.id && (
            <div className="mf-row" style={{ marginTop: 10 }}>
              <input className="mf-input mf-mono" type="number" placeholder="積立額" value={contributeAmount} onChange={(ev) => setContributeAmount(ev.target.value)} />
              <button className="mf-btn primary" onClick={() => submitContribute(e.id)}>
                記録
              </button>
              <button className="mf-btn ghost" onClick={() => setContributingId(null)}>
                キャンセル
              </button>
            </div>
          )}
        </div>
      ))}

      {events.filter((e) => e.status !== "active").length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">完了・中止したイベント</div>
          <div className="mf-list">
            {events
              .filter((e) => e.status !== "active")
              .map((e) => (
                <div key={e.id} className="mf-listrow">
                  <span className="mf-listcat">{e.name}</span>
                  <span className="mf-numsub">{e.status === "done" ? "完了" : "中止"}</span>
                  <button className="mf-del" onClick={() => remove(e.id)}>
                    削除
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="mf-panel">
        {!showForm ? (
          <button className="mf-btn primary" onClick={() => setShowForm(true)}>
            ＋ ライフイベントを追加
          </button>
        ) : (
          <>
            <div className="mf-paneltitle">{editingId ? "イベントを編集" : "新しいライフイベント"}</div>
            <div className="mf-formgrid">
              <input className="mf-input" placeholder="名前（例: 家の建て替え）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="mf-input mf-mono" type="number" placeholder="想定年" value={form.event_year} onChange={(e) => setForm({ ...form, event_year: Number(e.target.value) })} />
              <input className="mf-input mf-mono" type="number" placeholder="想定月（任意）" value={form.event_month} onChange={(e) => setForm({ ...form, event_month: e.target.value })} />
              <input className="mf-input mf-mono" type="number" placeholder="費用（下限）" value={form.cost_low} onChange={(e) => setForm({ ...form, cost_low: e.target.value })} />
              <input className="mf-input mf-mono" type="number" placeholder="費用（上限）" value={form.cost_high} onChange={(e) => setForm({ ...form, cost_high: e.target.value })} />
              <input className="mf-input" placeholder="見積の根拠" value={form.cost_basis} onChange={(e) => setForm({ ...form, cost_basis: e.target.value })} />
              <input
                className="mf-input mf-mono"
                type="number"
                placeholder="月々の積立額（任意）"
                value={form.monthly_saving}
                onChange={(e) => setForm({ ...form, monthly_saving: e.target.value })}
              />
              <input className="mf-input" placeholder="メモ" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
            <label className="mf-row" style={{ marginTop: 8, gap: 6 }}>
              <input type="checkbox" checked={form.visible_to_family} onChange={(e) => setForm({ ...form, visible_to_family: e.target.checked })} />
              <span className="mf-numsub">家族アカウントに公開する</span>
            </label>
            <div className="mf-row" style={{ marginTop: 10 }}>
              <button className="mf-btn primary" onClick={submitForm}>
                保存
              </button>
              <button className="mf-btn ghost" onClick={resetForm}>
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
