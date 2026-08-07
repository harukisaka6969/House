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

const emptyForm = {
  name: "",
  recurrence_type: "weekly" as RecurrenceType,
  day_of_week: 2,
  day_of_month: 1,
  memo: "",
  notifyEnabled: false,
  notifyHour: "21",
  notifyMinute: "00",
};

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const NIGHT_HOURS = new Set(["00", "01", "02", "03", "04", "05"]);
const MINUTES = ["00", "15", "30", "45"];

/** 「毎日」タイプは深夜（0〜5時）を選べないようにする（同じ通知が毎晩続くと迷惑なため）。 */
function hourOptionsFor(recurrenceType: RecurrenceType): string[] {
  return recurrenceType === "daily" ? HOURS.filter((h) => !NIGHT_HOURS.has(h)) : HOURS;
}

export default function Reminders() {
  const [reminders, setReminders] = useState<ReminderOut[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");
  const [editingNotifyId, setEditingNotifyId] = useState<string | null>(null);
  const [editHour, setEditHour] = useState("21");
  const [editMinute, setEditMinute] = useState("00");

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
        notify_time: form.notifyEnabled ? `${form.notifyHour}:${form.notifyMinute}` : null,
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

  const saveNotifyTime = async (id: string, time: string | null) => {
    await apiPut(`/api/reminders/${id}`, { notify_time: time });
    setEditingNotifyId(null);
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
                <button
                  key={v}
                  className={"mf-chipbtn" + (form.recurrence_type === v ? " on" : "")}
                  onClick={() =>
                    setForm({
                      ...form,
                      recurrence_type: v,
                      notifyHour: v === "daily" && NIGHT_HOURS.has(form.notifyHour) ? "21" : form.notifyHour,
                    })
                  }
                >
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

            <label className="mf-row" style={{ marginTop: 10, gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={form.notifyEnabled} onChange={(e) => setForm({ ...form, notifyEnabled: e.target.checked })} />
              この予定になったらLINEで個別に通知する
            </label>
            {form.notifyEnabled && form.recurrence_type === "daily" && (
              <div className="mf-hint" style={{ margin: "4px 0 0" }}>
                「毎日」は深夜（0〜5時）を選べません。
              </div>
            )}
            {form.notifyEnabled && (
              <div className="mf-row" style={{ marginTop: 6, gap: 8 }}>
                <select className="mf-input mf-mono" style={{ width: 90 }} value={form.notifyHour} onChange={(e) => setForm({ ...form, notifyHour: e.target.value })}>
                  {hourOptionsFor(form.recurrence_type).map((h) => (
                    <option key={h} value={h}>
                      {h}時
                    </option>
                  ))}
                </select>
                <select
                  className="mf-input mf-mono"
                  style={{ width: 90 }}
                  value={form.notifyMinute}
                  onChange={(e) => setForm({ ...form, notifyMinute: e.target.value })}
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m}分
                    </option>
                  ))}
                </select>
              </div>
            )}

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
                <button
                  className="mf-btn ghost"
                  style={{ padding: "3px 8px", fontSize: 12 }}
                  onClick={() => {
                    if (editingNotifyId === r.id) {
                      setEditingNotifyId(null);
                      return;
                    }
                    const [h, m] = (r.notify_time ?? "21:00").split(":");
                    setEditHour(h);
                    setEditMinute(m);
                    setEditingNotifyId(r.id);
                  }}
                >
                  {r.notify_time ? `🔔 ${r.notify_time}に個別通知` : "🔔 個別通知を設定"}
                </button>
              </div>
              {editingNotifyId === r.id && (
                <div className="mf-row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <select className="mf-input mf-mono" style={{ width: 90 }} value={editHour} onChange={(e) => setEditHour(e.target.value)}>
                    {hourOptionsFor(r.recurrence_type).map((h) => (
                      <option key={h} value={h}>
                        {h}時
                      </option>
                    ))}
                  </select>
                  <select className="mf-input mf-mono" style={{ width: 90 }} value={editMinute} onChange={(e) => setEditMinute(e.target.value)}>
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>
                        {m}分
                      </option>
                    ))}
                  </select>
                  <button className="mf-btn primary" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => saveNotifyTime(r.id, `${editHour}:${editMinute}`)}>
                    保存
                  </button>
                  {r.notify_time && (
                    <button className="mf-btn ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => saveNotifyTime(r.id, null)}>
                      通知オフ
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
