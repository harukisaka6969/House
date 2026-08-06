"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { ReminderOut, RecurrenceType } from "@/lib/apiTypes";
import { SectionHead } from "../common";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

export function recurrenceLabel(r: Pick<ReminderOut, "recurrence_type" | "day_of_week" | "day_of_month">): string {
  if (r.recurrence_type === "daily") return "毎日";
  if (r.recurrence_type === "weekly") return `毎週${DOW[r.day_of_week ?? 0]}曜日`;
  return `毎月${r.day_of_month ?? 1}日`;
}

const emptyForm = { name: "", recurrence_type: "weekly" as RecurrenceType, day_of_week: 2, day_of_month: 1, memo: "" };

export default function Reminders() {
  const [reminders, setReminders] = useState<ReminderOut[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");

  const load = () => {
    apiGet<{ reminders: ReminderOut[] }>("/api/reminders")
      .then((r) => setReminders(r.reminders))
      .catch(() => setReminders([]));
  };
  useEffect(load, []);

  if (!reminders) return <div className="mf-empty">読み込み中…</div>;

  const submit = async () => {
    if (!form.name.trim()) return;
    try {
      await apiPost("/api/reminders", {
        name: form.name,
        recurrence_type: form.recurrence_type,
        day_of_week: form.recurrence_type === "weekly" ? form.day_of_week : undefined,
        day_of_month: form.recurrence_type === "monthly" ? form.day_of_month : undefined,
        memo: form.memo,
      });
      setForm(emptyForm);
      setShowForm(false);
      setMsg("✓ 追加しました。");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "追加に失敗しました。");
    }
  };

  const toggleActive = async (r: ReminderOut) => {
    await apiPut(`/api/reminders/${r.id}`, { active: !r.active });
    load();
  };

  const toggleDone = async (r: ReminderOut) => {
    await apiPut(`/api/reminders/${r.id}`, { done: !r.done_today });
    load();
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/reminders/${id}`);
    load();
  };

  return (
    <section className="mf-section">
      <SectionHead no="20" title="リマインダー" sub="ゴミ出し・ペットの薬など、定期的にやることを登録しておくとホームに近日分が表示されます。" />

      <div className="mf-panel">
        {!showForm ? (
          <button className="mf-btn primary" onClick={() => setShowForm(true)}>
            + リマインダーを追加
          </button>
        ) : (
          <>
            <label className="mf-fieldlabel" htmlFor="rem-name">
              名前
            </label>
            <input id="rem-name" className="mf-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: ゴミ出し、クララに薬" />

            <div className="mf-quicklabel">頻度</div>
            <div className="mf-chips">
              {(
                [
                  ["daily", "毎日"],
                  ["weekly", "毎週"],
                  ["monthly", "毎月"],
                ] as [RecurrenceType, string][]
              ).map(([v, label]) => (
                <button key={v} className={"mf-chipbtn" + (form.recurrence_type === v ? " on" : "")} onClick={() => setForm({ ...form, recurrence_type: v })}>
                  {label}
                </button>
              ))}
            </div>

            {form.recurrence_type === "weekly" && (
              <div className="mf-chips" style={{ marginTop: 6 }}>
                {DOW.map((d, i) => (
                  <button key={d} className={"mf-chipbtn" + (form.day_of_week === i ? " on" : "")} onClick={() => setForm({ ...form, day_of_week: i })}>
                    {d}曜日
                  </button>
                ))}
              </div>
            )}
            {form.recurrence_type === "monthly" && (
              <div style={{ marginTop: 6 }}>
                <label className="mf-fieldlabel" htmlFor="rem-dom">
                  毎月の日
                </label>
                <input
                  id="rem-dom"
                  className="mf-input mf-mono"
                  type="number"
                  min={1}
                  max={31}
                  style={{ width: 100 }}
                  value={form.day_of_month}
                  onChange={(e) => setForm({ ...form, day_of_month: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                />
              </div>
            )}

            <label className="mf-fieldlabel" htmlFor="rem-memo">
              メモ（任意）
            </label>
            <input id="rem-memo" className="mf-input" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />

            <div className="mf-row" style={{ marginTop: 10 }}>
              <button className="mf-btn primary" onClick={submit}>
                追加する
              </button>
              <button
                className="mf-btn ghost"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm);
                }}
              >
                キャンセル
              </button>
            </div>
          </>
        )}
        {msg && <div className="mf-hint">{msg}</div>}
      </div>

      {reminders.length === 0 ? (
        <div className="mf-empty">まだリマインダーはありません。</div>
      ) : (
        <div className="mf-list" style={{ maxHeight: "none" }}>
          {reminders.map((r) => (
            <div key={r.id} className="mf-shopitem" style={{ opacity: r.active ? 1 : 0.5 }}>
              <div className="mf-row" style={{ gap: 10 }}>
                <span className="mf-shopname" style={r.done_today ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                  {r.done_today && "✓ "}
                  {r.name}
                </span>
                <button className="mf-del" onClick={() => remove(r.id)}>
                  ×
                </button>
              </div>
              <div className="mf-row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <span className="mf-listcat">
                  {recurrenceLabel(r)}（次回 {r.next_date}）
                </span>
                {r.memo && <span className="mf-hint" style={{ margin: 0 }}>{r.memo}</span>}
                <button
                  className={"mf-btn " + (r.done_today ? "ghost" : "primary")}
                  style={{ padding: "3px 8px", fontSize: 12 }}
                  onClick={() => toggleDone(r)}
                >
                  {r.done_today ? "完了を取り消す" : "✓ 完了にする"}
                </button>
                <button className="mf-btn ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => toggleActive(r)}>
                  {r.active ? "オフにする" : "オンにする"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
