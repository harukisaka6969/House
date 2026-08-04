"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { MealLogOut, PfcTargetOut } from "@/lib/apiTypes";
import { todayStrJST, periodKeyOfDate } from "@/lib/date";
import { SectionHead } from "../common";

function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

const DEFAULT_TARGET = { calories: 2380, protein_g: 175, fat_g: 65, carb_g: 275 };

function Bar({ label, actual, target, color }: { label: string; actual: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="mf-row" style={{ justifyContent: "space-between" }}>
        <span>{label}</span>
        <span className="mf-mono">
          {Math.round(actual)} / {Math.round(target)}
          {label === "カロリー" ? "kcal" : "g"}（{pct}%）
        </span>
      </div>
      <div className="mf-bar">
        <div className="mf-barfill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function MealLog() {
  const [date, setDate] = useState(todayStrJST());
  const [logs, setLogs] = useState<MealLogOut[] | null>(null);
  const [target, setTarget] = useState<PfcTargetOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetForm, setTargetForm] = useState(DEFAULT_TARGET);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [logEditForm, setLogEditForm] = useState({ description: "", calories: "", protein_g: "", fat_g: "", carb_g: "" });
  const [regenBusy, setRegenBusy] = useState(false);
  const [textIn, setTextIn] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const monthKey = periodKeyOfDate(date);

  const loadLogs = () => {
    apiGet<{ logs: MealLogOut[] }>(`/api/meal-logs?month=${monthKey}`)
      .then((r) => setLogs(r.logs))
      .catch(() => setLogs([]));
  };
  useEffect(loadLogs, [monthKey]);
  useEffect(() => {
    apiPost("/api/notifications/mark-seen", { kind: "meals" }).catch(() => {});
  }, []);

  useEffect(() => {
    apiGet<{ target: PfcTargetOut | null }>("/api/pfc-target")
      .then((r) => {
        const t = r.target ?? DEFAULT_TARGET;
        setTarget(t);
        setTargetForm(t);
      })
      .catch(() => setTarget(DEFAULT_TARGET));
  }, []);

  if (!logs || !target) return <div className="mf-empty">読み込み中…</div>;

  const dayLogs = logs.filter((l) => l.date === date).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const totals = dayLogs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein_g: acc.protein_g + l.protein_g,
      fat_g: acc.fat_g + l.fat_g,
      carb_g: acc.carb_g + l.carb_g,
    }),
    { calories: 0, protein_g: 0, fat_g: 0, carb_g: 0 }
  );

  const onFile = async (file: File) => {
    setBusy(true);
    setMsg("写真を解析中…");
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("date", date);
      const res = await fetch("/api/meal-logs", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.error) || "failed");
      }
      setMsg("✓ 記録しました。");
      loadLogs();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "解析に失敗しました。");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onText = async () => {
    if (!textIn.trim()) return;
    setTextBusy(true);
    setMsg("文章を解析中…");
    try {
      const fd = new FormData();
      fd.append("text", textIn.trim());
      fd.append("date", date);
      const res = await fetch("/api/meal-logs", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.error) || "failed");
      }
      setMsg("✓ 記録しました。");
      setTextIn("");
      loadLogs();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "解析に失敗しました。");
    }
    setTextBusy(false);
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/meal-logs/${id}`);
    loadLogs();
  };

  const startEditLog = (l: MealLogOut) => {
    setEditingLogId(l.id);
    setLogEditForm({
      description: l.description,
      calories: String(Math.round(l.calories)),
      protein_g: String(Math.round(l.protein_g)),
      fat_g: String(Math.round(l.fat_g)),
      carb_g: String(Math.round(l.carb_g)),
    });
  };

  const saveEditLog = async () => {
    if (!editingLogId) return;
    try {
      await apiPut(`/api/meal-logs/${editingLogId}`, {
        description: logEditForm.description,
        calories: Number(logEditForm.calories) || 0,
        protein_g: Number(logEditForm.protein_g) || 0,
        fat_g: Number(logEditForm.fat_g) || 0,
        carb_g: Number(logEditForm.carb_g) || 0,
      });
      setEditingLogId(null);
      loadLogs();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新に失敗しました。");
    }
  };

  const regenerateFromDescription = async () => {
    if (!editingLogId || !logEditForm.description.trim()) return;
    setRegenBusy(true);
    try {
      const r = await apiPut<{ log: MealLogOut }>(`/api/meal-logs/${editingLogId}`, { description: logEditForm.description, regenerate: true });
      setLogEditForm({
        description: r.log.description,
        calories: String(Math.round(r.log.calories)),
        protein_g: String(Math.round(r.log.protein_g)),
        fat_g: String(Math.round(r.log.fat_g)),
        carb_g: String(Math.round(r.log.carb_g)),
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "再計算に失敗しました。");
    }
    setRegenBusy(false);
  };

  const saveTarget = async () => {
    try {
      const r = await apiPut<{ target: PfcTargetOut }>("/api/pfc-target", targetForm);
      setTarget(r.target);
      setEditingTarget(false);
      setMsg("✓ 目標を更新しました。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新に失敗しました。");
    }
  };

  return (
    <section className="mf-section">
      <SectionHead no="15" title="食事ログ" sub="食事の写真、または文章の説明からAIがカロリー・PFCを大まかに推定します。目標と比較して見られます。" />

      <div className="mf-row" style={{ justifyContent: "center", gap: 10, marginBottom: 14 }}>
        <button className="mf-iconbtn" onClick={() => setDate(shiftDate(date, -1))} aria-label="前の日">
          ‹
        </button>
        <input className="mf-input mf-mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
        <button className="mf-iconbtn" onClick={() => setDate(shiftDate(date, 1))} aria-label="次の日">
          ›
        </button>
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">写真を追加</div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <button className="mf-btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "解析中…" : "📷 食事の写真をアップロード"}
        </button>

        <div className="mf-row" style={{ marginTop: 10 }}>
          <input
            className="mf-input"
            style={{ flex: 1 }}
            placeholder="文章で入力（例: 牛丼並盛とみそ汁）"
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

      <div className="mf-panel">
        <div className="mf-paneltitle">
          {date.slice(5).replace("-", "/")} の合計 / 目標
          <button className="mf-btn ghost" style={{ float: "right", padding: "4px 10px" }} onClick={() => setEditingTarget((v) => !v)}>
            目標を編集
          </button>
        </div>

        {editingTarget && (
          <div style={{ marginBottom: 14 }}>
            <label className="mf-fieldlabel" htmlFor="pfc-cal">
              カロリー(kcal)
            </label>
            <input
              id="pfc-cal"
              className="mf-input"
              type="number"
              value={targetForm.calories}
              onChange={(e) => setTargetForm({ ...targetForm, calories: Number(e.target.value) })}
            />
            <label className="mf-fieldlabel" htmlFor="pfc-p">
              タンパク質(g)
            </label>
            <input
              id="pfc-p"
              className="mf-input"
              type="number"
              value={targetForm.protein_g}
              onChange={(e) => setTargetForm({ ...targetForm, protein_g: Number(e.target.value) })}
            />
            <label className="mf-fieldlabel" htmlFor="pfc-f">
              脂質(g)
            </label>
            <input
              id="pfc-f"
              className="mf-input"
              type="number"
              value={targetForm.fat_g}
              onChange={(e) => setTargetForm({ ...targetForm, fat_g: Number(e.target.value) })}
            />
            <label className="mf-fieldlabel" htmlFor="pfc-c">
              炭水化物(g)
            </label>
            <input
              id="pfc-c"
              className="mf-input"
              type="number"
              value={targetForm.carb_g}
              onChange={(e) => setTargetForm({ ...targetForm, carb_g: Number(e.target.value) })}
            />
            <div className="mf-row" style={{ marginTop: 10 }}>
              <button className="mf-btn primary" onClick={saveTarget}>
                保存する
              </button>
              <button className="mf-btn ghost" onClick={() => setEditingTarget(false)}>
                キャンセル
              </button>
            </div>
          </div>
        )}

        <Bar label="カロリー" actual={totals.calories} target={target.calories} color="#c98500" />
        <Bar label="P" actual={totals.protein_g} target={target.protein_g} color="#3987e5" />
        <Bar label="F" actual={totals.fat_g} target={target.fat_g} color="#d55181" />
        <Bar label="C" actual={totals.carb_g} target={target.carb_g} color="#199e70" />
      </div>

      {dayLogs.length > 0 ? (
        <div className="mf-list" style={{ maxHeight: "none" }}>
          {dayLogs.map((l) =>
            editingLogId === l.id ? (
              <div key={l.id} className="mf-panel" style={{ margin: "6px 0" }}>
                <label className="mf-fieldlabel" htmlFor="mf-meal-desc">
                  内容
                </label>
                <div className="mf-row">
                  <input
                    id="mf-meal-desc"
                    className="mf-input"
                    style={{ flex: 1 }}
                    value={logEditForm.description}
                    onChange={(e) => setLogEditForm({ ...logEditForm, description: e.target.value })}
                  />
                  <button className="mf-btn ghost" style={{ flex: "0 0 auto" }} disabled={regenBusy || !logEditForm.description.trim()} onClick={regenerateFromDescription}>
                    {regenBusy ? "計算中…" : "✨ 内容から栄養を再計算"}
                  </button>
                </div>
                <div className="mf-formgrid" style={{ marginTop: 8 }}>
                  <div>
                    <label className="mf-fieldlabel" htmlFor="mf-meal-cal">
                      カロリー(kcal)
                    </label>
                    <input
                      id="mf-meal-cal"
                      className="mf-input mf-mono"
                      type="number"
                      value={logEditForm.calories}
                      onChange={(e) => setLogEditForm({ ...logEditForm, calories: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mf-fieldlabel" htmlFor="mf-meal-p">
                      P(g)
                    </label>
                    <input
                      id="mf-meal-p"
                      className="mf-input mf-mono"
                      type="number"
                      value={logEditForm.protein_g}
                      onChange={(e) => setLogEditForm({ ...logEditForm, protein_g: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mf-fieldlabel" htmlFor="mf-meal-f">
                      F(g)
                    </label>
                    <input
                      id="mf-meal-f"
                      className="mf-input mf-mono"
                      type="number"
                      value={logEditForm.fat_g}
                      onChange={(e) => setLogEditForm({ ...logEditForm, fat_g: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mf-fieldlabel" htmlFor="mf-meal-c">
                      C(g)
                    </label>
                    <input
                      id="mf-meal-c"
                      className="mf-input mf-mono"
                      type="number"
                      value={logEditForm.carb_g}
                      onChange={(e) => setLogEditForm({ ...logEditForm, carb_g: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mf-row" style={{ marginTop: 10 }}>
                  <button className="mf-btn primary" onClick={saveEditLog}>
                    保存する
                  </button>
                  <button className="mf-btn ghost" onClick={() => setEditingLogId(null)}>
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <div key={l.id} className="mf-listrow">
                <span className="mf-listmemo">{l.description || "（内容不明）"}</span>
                <span className="mf-mono" style={{ flex: "0 0 auto" }}>
                  {Math.round(l.calories)}kcal（P{Math.round(l.protein_g)} F{Math.round(l.fat_g)} C{Math.round(l.carb_g)}）
                </span>
                <button className="mf-btn ghost" style={{ padding: "4px 8px", flex: "0 0 auto" }} onClick={() => startEditLog(l)}>
                  編集
                </button>
                <button className="mf-del" onClick={() => remove(l.id)}>
                  ×
                </button>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="mf-empty">この日の記録はまだありません。</div>
      )}
    </section>
  );
}
