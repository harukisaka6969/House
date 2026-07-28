"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { RehabLogOut, RehabLogKind } from "@/lib/apiTypes";
import { todayStrJST } from "@/lib/date";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

const KIND_LABEL: Record<RehabLogKind, string> = {
  impulse: "① 衝動ログ",
  dignity: "② 人の尊厳日記",
  reframe: "③ 自己嫌悪を書き換える",
  love_check: "④ 愛のチェック",
};

interface ImpulseData {
  trigger: string;
  desire: string;
  rationalization: string;
  action: string;
  intensity: number;
}
interface DignityData {
  person: string;
  lines: string;
}
interface ReframeData {
  judgment: string;
  facts: string;
}
interface LoveCheckData {
  score: number;
  memo: string;
}

const emptyImpulse: ImpulseData = { trigger: "", desire: "", rationalization: "", action: "", intensity: 3 };
const emptyDignity: DignityData = { person: "", lines: "" };
const emptyReframe: ReframeData = { judgment: "", facts: "" };
const emptyLoveCheck: LoveCheckData = { score: 50, memo: "" };

function summarize(log: RehabLogOut): string {
  const d = log.data as Record<string, unknown>;
  switch (log.kind) {
    case "impulse":
      return [d.trigger, d.action].filter(Boolean).join(" → ") || "（未記入）";
    case "dignity":
      return (d.person as string) || "（未記入）";
    case "reframe":
      return (d.judgment as string) || "（未記入）";
    case "love_check":
      return `${d.score ?? 50}%（相手を安心させるため寄り）`;
    default:
      return "";
  }
}

export default function RehabPractice({ date, onSelectDate }: { date: string; onSelectDate: (d: string) => void }) {
  const monthKey = date.slice(0, 7);
  const [logs, setLogs] = useState<RehabLogOut[] | null>(null);
  const [kind, setKind] = useState<RehabLogKind>("impulse");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [impulseForm, setImpulseForm] = useState<ImpulseData>(emptyImpulse);
  const [dignityForm, setDignityForm] = useState<DignityData>(emptyDignity);
  const [reframeForm, setReframeForm] = useState<ReframeData>(emptyReframe);
  const [loveForm, setLoveForm] = useState<LoveCheckData>(emptyLoveCheck);
  const [msg, setMsg] = useState("");

  const load = () => {
    apiGet<{ logs: RehabLogOut[] }>(`/api/rehab-logs?month=${monthKey}`)
      .then((r) => setLogs(r.logs))
      .catch(() => setLogs([]));
  };
  useEffect(load, [monthKey]);

  if (!logs) return <div className="mf-empty">読み込み中…</div>;

  const markedDays = new Set(logs.map((l) => l.date));
  const dayLogs = logs.filter((l) => l.date === date).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const today = todayStrJST();

  const [y, m] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDow = new Date(y, m - 1, 1).getDay();
  const dkey = (d: number) => `${monthKey}-${String(d).padStart(2, "0")}`;
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const resetForms = () => {
    setImpulseForm(emptyImpulse);
    setDignityForm(emptyDignity);
    setReframeForm(emptyReframe);
    setLoveForm(emptyLoveCheck);
    setEditingId(null);
  };

  const startEdit = (log: RehabLogOut) => {
    setKind(log.kind);
    setEditingId(log.id);
    const d = log.data as Record<string, unknown>;
    if (log.kind === "impulse") setImpulseForm({ ...emptyImpulse, ...d } as ImpulseData);
    if (log.kind === "dignity") setDignityForm({ ...emptyDignity, ...d } as DignityData);
    if (log.kind === "reframe") setReframeForm({ ...emptyReframe, ...d } as ReframeData);
    if (log.kind === "love_check") setLoveForm({ ...emptyLoveCheck, ...d } as LoveCheckData);
  };

  const submit = async (submitKind: RehabLogKind, data: object) => {
    setMsg("");
    try {
      if (editingId) {
        await apiPut(`/api/rehab-logs/${editingId}`, { data });
      } else {
        await apiPost("/api/rehab-logs", { date, kind: submitKind, data });
      }
      resetForms();
      setMsg("✓ 記録しました。");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "記録に失敗しました。");
    }
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/rehab-logs/${id}`);
    if (editingId === id) resetForms();
    load();
  };

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">個人の振り返り（自分だけに表示されます）</div>
      <div className="mf-hint" style={{ opacity: 0.75, marginBottom: 10 }}>
        毎日15〜20分。自分の思考を客観視する能力を作るための記録です。
      </div>

      <div className="mf-calgrid" style={{ marginBottom: 10 }}>
        {DOW.map((d, i) => (
          <div key={d} className={"mf-calhead" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}>
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={"e" + i} />;
          const key = dkey(d);
          return (
            <button
              key={key}
              className={"mf-rehabcell" + (date === key ? " sel" : "") + (key === today ? " today" : "")}
              onClick={() => onSelectDate(key)}
            >
              {d}
              {markedDays.has(key) && <span className="mf-rehabmark" />}
            </button>
          );
        })}
      </div>

      <div className="mf-chips" style={{ marginBottom: 10 }}>
        {(Object.keys(KIND_LABEL) as RehabLogKind[]).map((k) => (
          <button
            key={k}
            className={"mf-chipbtn" + (kind === k ? " on" : "")}
            onClick={() => {
              setKind(k);
              setEditingId(null);
            }}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {kind === "impulse" && (
        <div>
          <label className="mf-fieldlabel" htmlFor="rh-trigger">
            何がきっかけだったか
          </label>
          <input
            id="rh-trigger"
            className="mf-input"
            placeholder="例: Amazonで○○を見た"
            value={impulseForm.trigger}
            onChange={(e) => setImpulseForm({ ...impulseForm, trigger: e.target.value })}
          />
          <label className="mf-fieldlabel" htmlFor="rh-desire">
            どんな欲求だったか
          </label>
          <input
            id="rh-desire"
            className="mf-input"
            placeholder="例: 少し興味が湧いた"
            value={impulseForm.desire}
            onChange={(e) => setImpulseForm({ ...impulseForm, desire: e.target.value })}
          />
          <label className="mf-fieldlabel" htmlFor="rh-rationalization">
            どんな理由を自分で付け始めたか
          </label>
          <input
            id="rh-rationalization"
            className="mf-input"
            placeholder="例: 別用途にも使えると考え始めた（危険サイン）"
            value={impulseForm.rationalization}
            onChange={(e) => setImpulseForm({ ...impulseForm, rationalization: e.target.value })}
          />
          <label className="mf-fieldlabel" htmlFor="rh-action">
            結局どう行動したか
          </label>
          <input
            id="rh-action"
            className="mf-input"
            placeholder="例: やめた／相談した／購入した"
            value={impulseForm.action}
            onChange={(e) => setImpulseForm({ ...impulseForm, action: e.target.value })}
          />
          <div className="mf-sliderrow" style={{ marginTop: 10 }}>
            <span>衝動の強さ</span>
            <span className="mf-mono">{impulseForm.intensity}</span>
          </div>
          <input
            className="mf-slider"
            type="range"
            min={1}
            max={5}
            value={impulseForm.intensity}
            onChange={(e) => setImpulseForm({ ...impulseForm, intensity: Number(e.target.value) })}
          />
          <div className="mf-row" style={{ marginTop: 10 }}>
            <button className="mf-btn primary" onClick={() => submit("impulse", impulseForm)}>
              {editingId ? "更新する" : "記録する"}
            </button>
            {editingId && (
              <button className="mf-btn ghost" onClick={resetForms}>
                キャンセル
              </button>
            )}
          </div>
        </div>
      )}

      {kind === "dignity" && (
        <div>
          <label className="mf-fieldlabel" htmlFor="rh-person">
            今日関わった人
          </label>
          <input
            id="rh-person"
            className="mf-input"
            placeholder="例: アリサ"
            value={dignityForm.person}
            onChange={(e) => setDignityForm({ ...dignityForm, person: e.target.value })}
          />
          <label className="mf-fieldlabel" htmlFor="rh-lines">
            「この人にはどんな人生があるだろう」を3行で
          </label>
          <textarea
            id="rh-lines"
            className="mf-input"
            style={{ width: "100%", minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
            placeholder={"例:\n今日も仕事で疲れていた。\n不安を抱えながら僕と話していた。\n安心して眠れる場所を求めていた。"}
            value={dignityForm.lines}
            onChange={(e) => setDignityForm({ ...dignityForm, lines: e.target.value })}
          />
          <div className="mf-row" style={{ marginTop: 10 }}>
            <button className="mf-btn primary" onClick={() => submit("dignity", dignityForm)}>
              {editingId ? "更新する" : "記録する"}
            </button>
            {editingId && (
              <button className="mf-btn ghost" onClick={resetForms}>
                キャンセル
              </button>
            )}
          </div>
        </div>
      )}

      {kind === "reframe" && (
        <div>
          <label className="mf-fieldlabel" htmlFor="rh-judgment">
            浮かんだ自己評価（例: 「俺は最低だ」）
          </label>
          <input
            id="rh-judgment"
            className="mf-input"
            placeholder="例: 俺は人間失格だ"
            value={reframeForm.judgment}
            onChange={(e) => setReframeForm({ ...reframeForm, judgment: e.target.value })}
          />
          <label className="mf-fieldlabel" htmlFor="rh-facts">
            事実だけを書く（人格評価は禁止）
          </label>
          <textarea
            id="rh-facts"
            className="mf-input"
            style={{ width: "100%", minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
            placeholder={"例:\n今日は衝動があった。\n相談できなかった。\n改善方法を考えた。"}
            value={reframeForm.facts}
            onChange={(e) => setReframeForm({ ...reframeForm, facts: e.target.value })}
          />
          <div className="mf-row" style={{ marginTop: 10 }}>
            <button className="mf-btn primary" onClick={() => submit("reframe", reframeForm)}>
              {editingId ? "更新する" : "記録する"}
            </button>
            {editingId && (
              <button className="mf-btn ghost" onClick={resetForms}>
                キャンセル
              </button>
            )}
          </div>
        </div>
      )}

      {kind === "love_check" && (
        <div>
          <div className="mf-hint" style={{ opacity: 0.75 }}>
            寝る前に一問。今日の行動は「嫌われないため」と「相手を安心させるため」のどちらが多かったか。
          </div>
          <div className="mf-sliderrow" style={{ marginTop: 10 }}>
            <span>嫌われないため</span>
            <span>相手を安心させるため</span>
          </div>
          <input
            className="mf-slider"
            type="range"
            min={0}
            max={100}
            value={loveForm.score}
            onChange={(e) => setLoveForm({ ...loveForm, score: Number(e.target.value) })}
          />
          <div className="mf-numsub mf-mono" style={{ textAlign: "center", marginBottom: 8 }}>
            {loveForm.score}%
          </div>
          <input
            className="mf-input"
            placeholder="メモ（任意）"
            value={loveForm.memo}
            onChange={(e) => setLoveForm({ ...loveForm, memo: e.target.value })}
          />
          <div className="mf-row" style={{ marginTop: 10 }}>
            <button className="mf-btn primary" onClick={() => submit("love_check", loveForm)}>
              {editingId ? "更新する" : "記録する"}
            </button>
            {editingId && (
              <button className="mf-btn ghost" onClick={resetForms}>
                キャンセル
              </button>
            )}
          </div>
        </div>
      )}

      {msg && <div className="mf-hint">{msg}</div>}

      {dayLogs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="mf-paneltitle">{date.slice(5).replace("-", "/")} の記録</div>
          <div className="mf-list" style={{ maxHeight: "none" }}>
            {dayLogs.map((log) => (
              <div key={log.id} className="mf-listrow">
                <span className="mf-listcat">{KIND_LABEL[log.kind]}</span>
                <span className="mf-listmemo">{summarize(log)}</span>
                <button className="mf-btn ghost" style={{ padding: "4px 8px", flex: "0 0 auto" }} onClick={() => startEdit(log)}>
                  編集
                </button>
                <button className="mf-del" onClick={() => remove(log.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
