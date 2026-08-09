"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete, ApiClientError } from "@/lib/apiClient";
import type { AnniversaryOut } from "@/lib/apiTypes";
import { nextOccurrence, daysUntil, yearsSince } from "@/lib/anniversaryMath";
import { SectionHead } from "../common";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function iconFor(name: string): string {
  if (name.includes("誕生日")) return "🎂";
  if (name.includes("結婚") || name.includes("プロポーズ")) return "💍";
  return "🎉";
}

const emptyForm = { name: "", date: "", memo: "" };

export default function Anniversaries() {
  const [items, setItems] = useState<AnniversaryOut[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = () => {
    apiGet<{ anniversaries: AnniversaryOut[] }>("/api/anniversaries")
      .then((r) => setItems(r.anniversaries))
      .catch(() => setItems([]));
  };
  useEffect(load, []);

  if (!items) return <div className="mf-empty">読み込み中…</div>;

  const today = todayStr();
  const sorted = [...items].sort((a, b) => daysUntil(nextOccurrence(a.date, today), today) - daysUntil(nextOccurrence(b.date, today), today));

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (a: AnniversaryOut) => {
    setForm({ name: a.name, date: a.date, memo: a.memo });
    setEditingId(a.id);
    setShowForm(true);
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.date) {
      setMsg("名前と日付を入力してください。");
      return;
    }
    setMsg("");
    try {
      const payload = { name: form.name.trim(), date: form.date, memo: form.memo.trim() };
      if (editingId) await apiPut(`/api/anniversaries/${editingId}`, payload);
      else await apiPost("/api/anniversaries", payload);
      resetForm();
      load();
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : "保存に失敗しました。");
    }
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/anniversaries/${id}`);
    load();
  };

  return (
    <section className="mf-section">
      <SectionHead no="23" title="記念日" sub="結婚記念日・誕生日などの大切な日。毎晩のLINEだよりで「今日は〜」と知らせます。" />

      {sorted.length === 0 ? (
        <div className="mf-empty">まだ記念日が登録されていません。下のフォームから追加してください。</div>
      ) : (
        <div className="mf-panel">
          <div className="mf-list">
            {sorted.map((a) => {
              const next = nextOccurrence(a.date, today);
              const days = daysUntil(next, today);
              const nextYears = yearsSince(a.date, next);
              const isBirthday = a.name.includes("誕生日");
              return (
                <div key={a.id} className="mf-listrow" style={{ flexWrap: "wrap" }}>
                  <span style={{ fontSize: 18 }}>{iconFor(a.name)}</span>
                  <span className="mf-listcat">{a.name}</span>
                  <span className="mf-listmemo">
                    {a.date}（{days === 0 ? "今日" : `あと${days}日`} ／ {isBirthday ? `${nextYears}歳` : `${nextYears}周年`}）
                    {a.memo && ` ・ ${a.memo}`}
                  </span>
                  <button className="mf-btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => startEdit(a)}>
                    編集
                  </button>
                  <button className="mf-del" onClick={() => remove(a.id)}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mf-panel">
        {!showForm ? (
          <button className="mf-btn primary" onClick={() => setShowForm(true)}>
            ＋ 記念日を追加
          </button>
        ) : (
          <>
            <div className="mf-paneltitle">{editingId ? "記念日を編集" : "新しい記念日"}</div>
            <div className="mf-formgrid">
              <input className="mf-input" placeholder="名前（例: 結婚記念日）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="mf-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <input className="mf-input" placeholder="メモ（任意）" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
            <div className="mf-hint" style={{ opacity: 0.7 }}>
              誕生日は名前に「誕生日」を含めてください（表示や毎晩のメッセージの言い回しが変わります）。
            </div>
            {msg && <div className="mf-hint">{msg}</div>}
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
