"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { MealLogOut, PfcTargetOut, MealPrepOut } from "@/lib/apiTypes";
import { businessDateJST, periodKeyOfDate } from "@/lib/date";
import { DEFAULT_PFC_TARGET } from "@/lib/pfcDefaults";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";

function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

const DEFAULT_TARGET = DEFAULT_PFC_TARGET;

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
  const { me } = useDashboard();
  const [date, setDate] = useState(businessDateJST());
  const [logs, setLogs] = useState<MealLogOut[] | null>(null);
  const [target, setTarget] = useState<PfcTargetOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetForm, setTargetForm] = useState(DEFAULT_TARGET);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [copyBusyId, setCopyBusyId] = useState<string | null>(null);
  const [logEditForm, setLogEditForm] = useState({ description: "", calories: "", protein_g: "", fat_g: "", carb_g: "" });
  const [regenBusy, setRegenBusy] = useState(false);
  const [textIn, setTextIn] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [preps, setPreps] = useState<MealPrepOut[] | null>(null);
  const [showAddPrep, setShowAddPrep] = useState(false);
  const [prepManual, setPrepManual] = useState(false);
  const [prepName, setPrepName] = useState("");
  const [prepWeight, setPrepWeight] = useState("");
  const [prepDesc, setPrepDesc] = useState("");
  const [prepCal, setPrepCal] = useState("");
  const [prepP, setPrepP] = useState("");
  const [prepF, setPrepF] = useState("");
  const [prepC, setPrepC] = useState("");
  const [prepBusy, setPrepBusy] = useState(false);
  const [prepGramsIn, setPrepGramsIn] = useState<Record<string, string>>({});
  const [prepEatBusyId, setPrepEatBusyId] = useState<string | null>(null);
  const prepFileRef = useRef<HTMLInputElement>(null);

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

  const loadPreps = () => {
    apiGet<{ preps: MealPrepOut[] }>("/api/meal-preps")
      .then((r) => setPreps(r.preps))
      .catch(() => setPreps([]));
  };
  useEffect(loadPreps, []);

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

  const onFiles = async (files: FileList) => {
    const list = Array.from(files);
    setBusy(true);
    let ok = 0;
    let lastError = "";
    for (let i = 0; i < list.length; i++) {
      setMsg(list.length > 1 ? `写真を解析中…（${i + 1}/${list.length}）` : "写真を解析中…");
      try {
        const fd = new FormData();
        fd.append("image", list[i]);
        fd.append("date", date);
        const res = await fetch("/api/meal-logs", { method: "POST", body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error((body && body.error) || "failed");
        }
        ok++;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "解析に失敗しました。";
      }
    }
    setMsg(list.length > 1 ? `✓ ${ok}/${list.length}件を記録しました。${ok < list.length ? lastError : ""}` : ok > 0 ? "✓ 記録しました。" : lastError);
    loadLogs();
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

  const copyToPartner = async (l: MealLogOut) => {
    setCopyBusyId(l.id);
    try {
      const r = await apiPost<{ partnerName: string }>(`/api/meal-logs/${l.id}/copy-to-partner`);
      setMsg(`✓ ${r.partnerName}にも登録しました。`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    }
    setCopyBusyId(null);
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

  const resetPrepForm = () => {
    setPrepName("");
    setPrepWeight("");
    setPrepDesc("");
    setPrepCal("");
    setPrepP("");
    setPrepF("");
    setPrepC("");
    setPrepManual(false);
  };

  const submitPrep = async (fd: FormData) => {
    setPrepBusy(true);
    setMsg("作り置きを登録中…");
    try {
      const res = await fetch("/api/meal-preps", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body && body.error) || "failed");
      }
      setMsg("✓ 作り置きを登録しました。");
      resetPrepForm();
      setShowAddPrep(false);
      loadPreps();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    }
    setPrepBusy(false);
    if (prepFileRef.current) prepFileRef.current.value = "";
  };

  const addPrepManual = () => {
    if (!prepName.trim() || !prepWeight.trim()) return;
    const fd = new FormData();
    fd.append("name", prepName.trim());
    fd.append("total_weight_g", prepWeight.trim());
    fd.append("calories", prepCal || "0");
    fd.append("protein_g", prepP || "0");
    fd.append("fat_g", prepF || "0");
    fd.append("carb_g", prepC || "0");
    submitPrep(fd);
  };

  const addPrepFromText = () => {
    if (!prepWeight.trim() || !prepDesc.trim()) return;
    const fd = new FormData();
    if (prepName.trim()) fd.append("name", prepName.trim());
    fd.append("total_weight_g", prepWeight.trim());
    fd.append("text", prepDesc.trim());
    submitPrep(fd);
  };

  const addPrepFromPhoto = (file: File) => {
    if (!prepWeight.trim()) {
      setMsg("先に総重量(g)を入力してください。");
      return;
    }
    const fd = new FormData();
    if (prepName.trim()) fd.append("name", prepName.trim());
    fd.append("total_weight_g", prepWeight.trim());
    fd.append("image", file);
    submitPrep(fd);
  };

  const deletePrep = async (id: string) => {
    await apiDelete(`/api/meal-preps/${id}`);
    loadPreps();
  };

  const eatPrep = async (prep: MealPrepOut) => {
    const grams = Number(prepGramsIn[prep.id]);
    if (!Number.isFinite(grams) || grams <= 0) return;
    setPrepEatBusyId(prep.id);
    try {
      await apiPost(`/api/meal-preps/${prep.id}/consume`, { grams, date });
      setPrepGramsIn((s) => ({ ...s, [prep.id]: "" }));
      setMsg(`✓ ${prep.name}を${grams}g記録しました。`);
      loadLogs();
      loadPreps();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "記録に失敗しました。");
    }
    setPrepEatBusyId(null);
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
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) onFiles(files);
          }}
        />
        <button className="mf-btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "解析中…" : "📷 食事の写真をアップロード（複数可）"}
        </button>

        <div className="mf-row" style={{ marginTop: 10 }}>
          <input
            className="mf-input"
            style={{ flex: 1 }}
            placeholder="文章で入力（例: 牛丼並盛とみそ汁 ／ サイゼリヤで外食、満腹度8割）"
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
        <div className="mf-paneltitle">作り置き</div>
        <div className="mf-hint" style={{ opacity: 0.7 }}>
          まとめて作った料理を1回だけ登録しておくと、以降は「〇〇g食べた」と入力するだけで按分計算されます（LINEでも「（名前）を150g食べた」で記録できます）。
        </div>

        {preps === null ? (
          <div className="mf-empty" style={{ marginTop: 8 }}>
            読み込み中…
          </div>
        ) : preps.length === 0 ? (
          <div className="mf-empty" style={{ marginTop: 8 }}>
            まだ登録されていません。
          </div>
        ) : (
          <div className="mf-list" style={{ maxHeight: "none", marginTop: 8 }}>
            {preps.map((p) => (
              <div key={p.id} className="mf-listrow" style={{ flexWrap: "wrap" }}>
                <span className="mf-listname" title={p.name}>
                  {p.name}
                </span>
                <span className="mf-hint" style={{ margin: 0 }}>
                  残り {Math.round(p.remaining_weight_g)}g / {Math.round(p.total_weight_g)}g
                </span>
                <input
                  className="mf-input mf-mono"
                  type="number"
                  placeholder="g"
                  style={{ width: 80, flex: "0 0 auto" }}
                  value={prepGramsIn[p.id] ?? ""}
                  onChange={(e) => setPrepGramsIn((s) => ({ ...s, [p.id]: e.target.value }))}
                />
                <button className="mf-btn ghost" disabled={prepEatBusyId === p.id || !prepGramsIn[p.id]} onClick={() => eatPrep(p)}>
                  {prepEatBusyId === p.id ? "記録中…" : "食べた"}
                </button>
                <button className="mf-del" onClick={() => deletePrep(p.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {!showAddPrep ? (
          <button className="mf-btn ghost" style={{ marginTop: 10 }} onClick={() => setShowAddPrep(true)}>
            ＋ 作り置きを登録
          </button>
        ) : (
          <div style={{ marginTop: 10 }}>
            <div className="mf-formgrid">
              <input className="mf-input" placeholder="名前（例: 鶏むね肉のトマト煮）" value={prepName} onChange={(e) => setPrepName(e.target.value)} />
              <input className="mf-input mf-mono" type="number" placeholder="総重量(g)" value={prepWeight} onChange={(e) => setPrepWeight(e.target.value)} />
            </div>

            <div className="mf-chips" style={{ marginTop: 8 }}>
              <button className={"mf-chipbtn" + (!prepManual ? " on" : "")} onClick={() => setPrepManual(false)}>
                AIで推定
              </button>
              <button className={"mf-chipbtn" + (prepManual ? " on" : "")} onClick={() => setPrepManual(true)}>
                手入力する
              </button>
            </div>

            {!prepManual ? (
              <>
                <div className="mf-row" style={{ marginTop: 8 }}>
                  <input
                    className="mf-input"
                    style={{ flex: 1 }}
                    placeholder="材料・内容（例: 鶏むね肉600g、玄米500g、ブロッコリー200g）"
                    value={prepDesc}
                    onChange={(e) => setPrepDesc(e.target.value)}
                  />
                  <button className="mf-btn primary" disabled={prepBusy || !prepWeight.trim() || !prepDesc.trim()} onClick={addPrepFromText}>
                    {prepBusy ? "解析中…" : "登録"}
                  </button>
                </div>
                <input
                  ref={prepFileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) addPrepFromPhoto(f);
                  }}
                />
                <button className="mf-btn ghost" style={{ marginTop: 8 }} disabled={prepBusy} onClick={() => prepFileRef.current?.click()}>
                  📷 できあがり写真から登録
                </button>
              </>
            ) : (
              <div className="mf-formgrid" style={{ marginTop: 8 }}>
                <input className="mf-input mf-mono" type="number" placeholder="総カロリー(kcal)" value={prepCal} onChange={(e) => setPrepCal(e.target.value)} />
                <input className="mf-input mf-mono" type="number" placeholder="総タンパク質(g)" value={prepP} onChange={(e) => setPrepP(e.target.value)} />
                <input className="mf-input mf-mono" type="number" placeholder="総脂質(g)" value={prepF} onChange={(e) => setPrepF(e.target.value)} />
                <input className="mf-input mf-mono" type="number" placeholder="総炭水化物(g)" value={prepC} onChange={(e) => setPrepC(e.target.value)} />
                <button className="mf-btn primary" disabled={prepBusy || !prepName.trim() || !prepWeight.trim()} onClick={addPrepManual}>
                  {prepBusy ? "登録中…" : "登録"}
                </button>
              </div>
            )}

            <button
              className="mf-btn ghost"
              style={{ marginTop: 8 }}
              onClick={() => {
                setShowAddPrep(false);
                resetPrepForm();
              }}
            >
              キャンセル
            </button>
          </div>
        )}
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
                {me?.partner && (
                  <button
                    className="mf-btn ghost"
                    style={{ padding: "4px 8px", flex: "0 0 auto" }}
                    disabled={copyBusyId === l.id}
                    onClick={() => copyToPartner(l)}
                  >
                    {copyBusyId === l.id ? "登録中…" : `${me.partner.name}も同じものを食べた`}
                  </button>
                )}
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
