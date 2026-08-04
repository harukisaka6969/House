"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPut, apiDelete } from "@/lib/apiClient";
import type { PersonalRecordOut, RecordCategorySummary, RecordMetric } from "@/lib/apiTypes";
import { SectionHead } from "../common";

/** 値の先頭にある数値（例: "84.1kg"→84.1）を取り出す。比較不能なら null。 */
function leadingNumber(value: string): number | null {
  const m = value.match(/^-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function Delta({ current, previous }: { current: RecordMetric; previous?: RecordMetric }) {
  if (!previous) return null;
  const a = leadingNumber(current.value);
  const b = leadingNumber(previous.value);
  if (a === null || b === null) return null;
  const diff = Math.round((a - b) * 100) / 100;
  if (diff === 0) return <span className="mf-hint" style={{ margin: 0, opacity: 0.6 }}>±0</span>;
  const up = diff > 0;
  return (
    <span className="mf-hint" style={{ margin: 0, color: up ? "#F26D5F" : "#3DDC97" }}>
      {up ? "▲" : "▼"}
      {Math.abs(diff)}
    </span>
  );
}

export default function Records() {
  const [categories, setCategories] = useState<RecordCategorySummary[] | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [records, setRecords] = useState<PersonalRecordOut[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ category: string; date: string; title: string; metrics: RecordMetric[]; memo: string }>({
    category: "",
    date: "",
    title: "",
    metrics: [],
    memo: "",
  });
  const [textIn, setTextIn] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCategories = () => {
    apiGet<{ categories: RecordCategorySummary[] }>("/api/records")
      .then((r) => {
        setCategories(r.categories);
        setActiveCategory((prev) => prev ?? r.categories[0]?.category ?? null);
      })
      .catch(() => setCategories([]));
  };
  useEffect(loadCategories, []);

  const loadRecords = (category: string) => {
    apiGet<{ records: PersonalRecordOut[] }>(`/api/records?category=${encodeURIComponent(category)}`)
      .then((r) => setRecords(r.records))
      .catch(() => setRecords([]));
  };
  useEffect(() => {
    if (activeCategory) loadRecords(activeCategory);
  }, [activeCategory]);

  const submitRecord = async (fd: FormData): Promise<boolean> => {
    setMsg("記録を解析中…");
    try {
      const res = await fetch("/api/records", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.error) || "failed");
      }
      const { record } = (await res.json()) as { record: PersonalRecordOut };
      setMsg(`✓「${record.category}」として記録しました。`);
      setActiveCategory(record.category);
      loadCategories();
      loadRecords(record.category);
      return true;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "解析に失敗しました。");
      return false;
    }
  };

  const onFile = async (file: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append("image", file);
    await submitRecord(fd);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onText = async () => {
    if (!textIn.trim()) return;
    setTextBusy(true);
    const fd = new FormData();
    fd.append("text", textIn.trim());
    if (await submitRecord(fd)) setTextIn("");
    setTextBusy(false);
  };

  const startEdit = (r: PersonalRecordOut) => {
    setEditingId(r.id);
    setEditForm({ category: r.category, date: r.date, title: r.title, metrics: r.metrics.length ? [...r.metrics] : [{ label: "", value: "" }], memo: r.memo });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const metrics = editForm.metrics.filter((m) => m.label.trim() || m.value.trim());
    await apiPut(`/api/records/${editingId}`, { category: editForm.category, date: editForm.date, title: editForm.title, metrics, memo: editForm.memo });
    setEditingId(null);
    const movedCategory = editForm.category.trim();
    loadCategories();
    if (movedCategory && movedCategory !== activeCategory) setActiveCategory(movedCategory);
    else if (activeCategory) loadRecords(activeCategory);
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/records/${id}`);
    loadCategories();
    if (activeCategory) loadRecords(activeCategory);
  };

  const updateMetric = (i: number, field: "label" | "value", v: string) => {
    setEditForm((f) => ({ ...f, metrics: f.metrics.map((m, idx) => (idx === i ? { ...m, [field]: v } : m)) }));
  };
  const addMetricRow = () => setEditForm((f) => ({ ...f, metrics: [...f.metrics, { label: "", value: "" }] }));
  const removeMetricRow = (i: number) => setEditForm((f) => ({ ...f, metrics: f.metrics.filter((_, idx) => idx !== i) }));

  if (!categories) return <div className="mf-empty">読み込み中…</div>;

  return (
    <section className="mf-section">
      <SectionHead
        no="18"
        title="記録"
        sub="体組成計・ランニング・ボルダリングなど、何でも写真か文章で記録すると自動でカテゴリごとに整理されます（自分だけの記録です）。"
      />

      <div className="mf-panel">
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button className="mf-photobox" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "解析中…" : "📷 記録を撮影・アップロード"}
        </button>

        <div className="mf-row" style={{ marginTop: 10 }}>
          <input
            className="mf-input"
            style={{ flex: 1 }}
            placeholder="文章で入力（例: 体重84.1kg、体脂肪率21.5%だった）"
            value={textIn}
            onChange={(e) => setTextIn(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onText()}
          />
          <button className="mf-btn ghost" disabled={textBusy || !textIn.trim()} onClick={onText}>
            {textBusy ? "解析中…" : "✍️ 記録する"}
          </button>
        </div>
        {msg && <div className="mf-hint">{msg}</div>}
      </div>

      {categories.length === 0 ? (
        <div className="mf-empty" style={{ marginTop: 12 }}>
          まだ記録がありません。写真をアップロードすると自動でカテゴリが作られます。
        </div>
      ) : (
        <div className="mf-panel">
          <div className="mf-chips">
            {categories.map((c) => (
              <button key={c.category} className={"mf-chipbtn" + (activeCategory === c.category ? " on" : "")} onClick={() => setActiveCategory(c.category)}>
                {c.category}
                <span className="mf-hint" style={{ margin: 0, opacity: 0.6 }}>
                  {c.count}件
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeCategory && records && (
        <div className="mf-panel">
          <div className="mf-paneltitle">{activeCategory}の記録（新しい順）</div>
          {records.length === 0 ? (
            <div className="mf-empty">記録がありません。</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {records.map((r, i) => {
                const prev = records[i + 1];
                return (
                  <div key={r.id} className="mf-panel" style={{ margin: 0, background: "#101418" }}>
                    {editingId === r.id ? (
                      <>
                        <div className="mf-row">
                          <input className="mf-input" style={{ flex: 1 }} value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} placeholder="カテゴリ" />
                          <input className="mf-input" type="date" value={editForm.date} onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))} />
                        </div>
                        <input
                          className="mf-input"
                          style={{ marginTop: 6 }}
                          value={editForm.title}
                          onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                          placeholder="タイトル"
                        />
                        <div style={{ marginTop: 8 }}>
                          {editForm.metrics.map((m, idx) => (
                            <div key={idx} className="mf-row" style={{ marginTop: 4 }}>
                              <input className="mf-input" style={{ flex: 1 }} value={m.label} onChange={(e) => updateMetric(idx, "label", e.target.value)} placeholder="項目名" />
                              <input className="mf-input" style={{ flex: 1 }} value={m.value} onChange={(e) => updateMetric(idx, "value", e.target.value)} placeholder="値" />
                              <button className="mf-del" onClick={() => removeMetricRow(idx)}>
                                ×
                              </button>
                            </div>
                          ))}
                          <button className="mf-btn ghost" style={{ marginTop: 6, padding: "4px 10px", fontSize: 12 }} onClick={addMetricRow}>
                            + 項目を追加
                          </button>
                        </div>
                        <textarea
                          className="mf-input"
                          style={{ marginTop: 8, minHeight: 50, resize: "vertical", fontFamily: "inherit" }}
                          value={editForm.memo}
                          onChange={(e) => setEditForm((f) => ({ ...f, memo: e.target.value }))}
                          placeholder="メモ（任意）"
                        />
                        <div className="mf-row" style={{ marginTop: 8 }}>
                          <button className="mf-btn primary" onClick={saveEdit}>
                            保存
                          </button>
                          <button className="mf-btn ghost" onClick={() => setEditingId(null)}>
                            キャンセル
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mf-row" style={{ justifyContent: "space-between" }}>
                          <div>
                            <b>{r.title || r.category}</b>
                            <span className="mf-hint" style={{ margin: "0 0 0 8px", display: "inline" }}>
                              {r.date}
                            </span>
                          </div>
                          <div className="mf-row" style={{ gap: 4 }}>
                            <button className="mf-btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => startEdit(r)}>
                              編集
                            </button>
                            <button className="mf-del" onClick={() => remove(r.id)}>
                              ×
                            </button>
                          </div>
                        </div>
                        {r.metrics.length > 0 && (
                          <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
                            {r.metrics.map((m, idx) => (
                              <div key={idx} className="mf-row" style={{ justifyContent: "space-between", gap: 6 }}>
                                <span className="mf-hint" style={{ margin: 0 }}>
                                  {m.label}
                                </span>
                                <span className="mf-row" style={{ gap: 6 }}>
                                  <b className="mf-mono">{m.value}</b>
                                  <Delta current={m} previous={prev?.metrics.find((pm) => pm.label === m.label)} />
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {r.memo && (
                          <div className="mf-hint" style={{ marginTop: 6 }}>
                            {r.memo}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
