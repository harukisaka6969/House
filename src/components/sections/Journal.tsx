"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPut, apiPost, apiDelete } from "@/lib/apiClient";
import type { JournalEntryOut, SportLogOut } from "@/lib/apiTypes";
import { todayStrJST } from "@/lib/date";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";

const emptySportForm = { activity: "", duration_minutes: "", distance_km: "", memo: "" };

function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export default function Journal() {
  const { me } = useDashboard();
  const [date, setDate] = useState(todayStrJST());
  const [entries, setEntries] = useState<JournalEntryOut[] | null>(null);
  const [sportLogs, setSportLogs] = useState<SportLogOut[] | null>(null);
  const [bodyDraft, setBodyDraft] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [showSportForm, setShowSportForm] = useState(false);
  const [sportForm, setSportForm] = useState(emptySportForm);

  const monthKey = date.slice(0, 7);
  const meId = me?.profile.id;
  const meName = me?.profile.name ?? "";

  const load = () => {
    apiGet<{ entries: JournalEntryOut[]; sportLogs: SportLogOut[] }>(`/api/journal?month=${monthKey}`)
      .then((r) => {
        setEntries(r.entries);
        setSportLogs(r.sportLogs);
      })
      .catch(() => {
        setEntries([]);
        setSportLogs([]);
      });
  };
  useEffect(load, [monthKey]);

  useEffect(() => {
    const mine = entries?.find((e) => e.owner === meId && e.date === date);
    setBodyDraft(mine?.body ?? "");
    setSaveMsg("");
  }, [entries, date, meId]);

  if (!entries || !sportLogs) return <div className="mf-empty">読み込み中…</div>;

  const myEntry = entries.find((e) => e.owner === meId && e.date === date);
  const partnerEntry = entries.find((e) => e.owner !== meId && e.date === date);
  const dayLogs = sportLogs.filter((l) => l.date === date);

  const saveEntry = async () => {
    try {
      await apiPut(`/api/journal/${date}`, { body: bodyDraft });
      setSaveMsg("✓ 保存しました。");
      load();
    } catch {
      setSaveMsg("保存に失敗しました。");
    }
  };

  const clearEntry = async () => {
    if (!myEntry) return;
    await apiDelete(`/api/journal/${date}`);
    setBodyDraft("");
    load();
  };

  const submitSport = async () => {
    if (!sportForm.activity.trim()) return;
    await apiPost("/api/sport-logs", {
      date,
      activity: sportForm.activity.trim(),
      duration_minutes: sportForm.duration_minutes ? Number(sportForm.duration_minutes) : undefined,
      distance_km: sportForm.distance_km ? Number(sportForm.distance_km) : undefined,
      memo: sportForm.memo,
    });
    setSportForm(emptySportForm);
    setShowSportForm(false);
    load();
  };

  const deleteSport = async (id: string) => {
    await apiDelete(`/api/sport-logs/${id}`);
    load();
  };

  return (
    <section className="mf-section">
      <SectionHead no="12" title="日記" sub="その日にやったこと・運動の記録。お互いの記録が見られます（編集は本人のみ）。" />

      <div className="mf-row" style={{ justifyContent: "center", gap: 10, marginBottom: 14 }}>
        <button className="mf-iconbtn" onClick={() => setDate(shiftDate(date, -1))} aria-label="前の日">
          ‹
        </button>
        <input className="mf-input mf-mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
        <button className="mf-iconbtn" onClick={() => setDate(shiftDate(date, 1))} aria-label="次の日">
          ›
        </button>
        <button className="mf-btn ghost" onClick={() => setDate(todayStrJST())}>
          今日
        </button>
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">{meName}の日記</div>
        <textarea
          className="mf-input"
          style={{ width: "100%", minHeight: 100, resize: "vertical", fontFamily: "inherit" }}
          placeholder="今日あったこと・やったことを書く…"
          value={bodyDraft}
          onChange={(e) => setBodyDraft(e.target.value)}
        />
        <div className="mf-row" style={{ marginTop: 8 }}>
          <button className="mf-btn primary" onClick={saveEntry}>
            保存
          </button>
          {myEntry && (
            <button className="mf-btn ghost" onClick={clearEntry}>
              削除
            </button>
          )}
        </div>
        {saveMsg && <div className="mf-hint">{saveMsg}</div>}
      </div>

      {partnerEntry && partnerEntry.body && (
        <div className="mf-panel">
          <div className="mf-paneltitle">{partnerEntry.owner_name}の日記</div>
          <div className="mf-numsub" style={{ whiteSpace: "pre-wrap" }}>
            {partnerEntry.body}
          </div>
        </div>
      )}

      <div className="mf-panel">
        <div className="mf-paneltitle">この日のスポーツ記録</div>
        {dayLogs.length === 0 ? (
          <div className="mf-empty">記録はまだありません。</div>
        ) : (
          <div className="mf-list" style={{ maxHeight: "none" }}>
            {dayLogs.map((l) => (
              <div key={l.id} className="mf-listrow">
                <span className="mf-listname" title={l.activity}>
                  {l.activity}
                </span>
                {l.owner !== meId && <span className="mf-ownerchip">{l.owner_name}</span>}
                <span className="mf-listmemo">
                  {[l.duration_minutes ? `${l.duration_minutes}分` : null, l.distance_km ? `${l.distance_km}km` : null, l.memo || null].filter(Boolean).join(" ／ ")}
                </span>
                {l.owner === meId && (
                  <button className="mf-del" onClick={() => deleteSport(l.id)}>
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {!showSportForm ? (
          <button className="mf-btn primary" style={{ marginTop: 10 }} onClick={() => setShowSportForm(true)}>
            ＋ 運動を記録
          </button>
        ) : (
          <div className="mf-formgrid" style={{ marginTop: 10 }}>
            <input className="mf-input" placeholder="種目（例: ランニング）" value={sportForm.activity} onChange={(e) => setSportForm({ ...sportForm, activity: e.target.value })} />
            <input
              className="mf-input mf-mono"
              type="number"
              placeholder="時間（分）"
              value={sportForm.duration_minutes}
              onChange={(e) => setSportForm({ ...sportForm, duration_minutes: e.target.value })}
            />
            <input
              className="mf-input mf-mono"
              type="number"
              placeholder="距離（km）"
              value={sportForm.distance_km}
              onChange={(e) => setSportForm({ ...sportForm, distance_km: e.target.value })}
            />
            <input className="mf-input" placeholder="メモ" value={sportForm.memo} onChange={(e) => setSportForm({ ...sportForm, memo: e.target.value })} />
            <div className="mf-row">
              <button className="mf-btn primary" onClick={submitSport}>
                記録する
              </button>
              <button className="mf-btn ghost" onClick={() => { setShowSportForm(false); setSportForm(emptySportForm); }}>
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
