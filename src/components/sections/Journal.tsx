"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPut, apiPost, apiDelete } from "@/lib/apiClient";
import type { JournalEntryOut, SportLogOut, ExpenseOut, JournalEncounterOut } from "@/lib/apiTypes";
import { todayStrJST, periodKeyOfDate } from "@/lib/date";
import { fmt } from "@/lib/judge";
import { categoriesForAccount } from "@/lib/constants";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";
import PeriodCalendar from "../PeriodCalendar";
import RehabPractice from "./RehabPractice";
import RehabCalendarBadge from "./RehabCalendarBadge";

const emptySportForm = { activity: "", duration_minutes: "", distance_km: "", memo: "" };

function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export default function Journal() {
  const { me, allCats, month } = useDashboard();
  const [date, setDate] = useState(todayStrJST());
  const [entries, setEntries] = useState<JournalEntryOut[] | null>(null);
  const [sportLogs, setSportLogs] = useState<SportLogOut[] | null>(null);
  const [journalExpenses, setJournalExpenses] = useState<ExpenseOut[]>([]);
  const [bodyDraft, setBodyDraft] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [showSportForm, setShowSportForm] = useState(false);
  const [sportForm, setSportForm] = useState(emptySportForm);
  const [isAiDraft, setIsAiDraft] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [encounters, setEncounters] = useState<JournalEncounterOut[]>([]);
  const [extractingPeople, setExtractingPeople] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ account_id: string; category: string; amount: string; memo: string }>({
    account_id: "a1",
    category: "",
    amount: "",
    memo: "",
  });
  const draftedForDate = useRef<string | null>(null);
  const dateRef = useRef(date);
  dateRef.current = date;
  const bodyDraftRef = useRef(bodyDraft);
  bodyDraftRef.current = bodyDraft;

  const monthKey = periodKeyOfDate(date);
  const meId = me?.profile.id;
  const meName = me?.profile.name ?? "";
  const accounts = month?.aggregates.perAccount ?? [];

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

  const loadJournalExpenses = () => {
    apiGet<{ journalExpenses: ExpenseOut[] }>(`/api/journal/${date}`)
      .then((r) => setJournalExpenses(r.journalExpenses))
      .catch(() => setJournalExpenses([]));
  };
  useEffect(loadJournalExpenses, [date]);

  const loadEncounters = () => {
    apiGet<{ encounters: JournalEncounterOut[] }>(`/api/journal/${date}/extract-people`)
      .then((r) => setEncounters(r.encounters))
      .catch(() => setEncounters([]));
  };
  useEffect(loadEncounters, [date]);

  useEffect(() => {
    const mine = entries?.find((e) => e.owner === meId && e.date === date);
    setBodyDraft(mine?.body ?? "");
    setIsAiDraft(false);
    setSaveMsg("");
    setEditingExpenseId(null);

    // 日記が空でまだこの日を下書きしていなければ、その日の支出からAIで自動下書きする。
    if (!mine?.body && draftedForDate.current !== date) {
      const requestDate = date;
      draftedForDate.current = date;
      setDrafting(true);
      apiPost<{ draft: string; hasExpenses: boolean }>(`/api/journal/${requestDate}/auto-draft`)
        .then((r) => {
          // 取得中に別の日へ移動した・すでに入力を始めていた場合は上書きしない。
          if (r.hasExpenses && r.draft && dateRef.current === requestDate && bodyDraftRef.current === "") {
            setBodyDraft(r.draft);
            setIsAiDraft(true);
          }
        })
        .catch(() => {})
        .finally(() => setDrafting(false));
    }
  }, [entries, date, meId]);

  if (!entries || !sportLogs) return <div className="mf-empty">読み込み中…</div>;

  const myEntry = entries.find((e) => e.owner === meId && e.date === date);
  const dayLogs = sportLogs.filter((l) => l.date === date);
  const gymDays = new Set(sportLogs.filter((l) => l.activity.includes("ジム")).map((l) => l.date));

  const today = todayStrJST();

  const saveEntry = async () => {
    try {
      await apiPut(`/api/journal/${date}`, { body: bodyDraft });
      setIsAiDraft(false);
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

  const importMoneyFromDiary = async () => {
    if (!bodyDraft.trim()) return;
    setExtracting(true);
    try {
      const r = await apiPost<{ expenses: ExpenseOut[] }>(`/api/journal/${date}/extract-money`, { text: bodyDraft });
      setJournalExpenses(r.expenses);
      setSaveMsg(
        r.expenses.length > 0
          ? `✓ 日記からお金の動きを${r.expenses.length}件、支出明細にインポートしました（内容を確認してください）。`
          : "この日記からはお金の動きが見つかりませんでした。"
      );
    } catch (e) {
      setSaveMsg(`インポートに失敗しました。${e instanceof Error ? e.message : ""}`);
    } finally {
      setExtracting(false);
    }
  };

  const extractPeopleFromDiary = async () => {
    if (!bodyDraft.trim()) return;
    setExtractingPeople(true);
    try {
      const r = await apiPost<{ encounters: JournalEncounterOut[] }>(`/api/journal/${date}/extract-people`, { text: bodyDraft });
      setEncounters(r.encounters);
      setSaveMsg(r.encounters.length > 0 ? `✓ ${r.encounters.length}人分の記録を「知人」に反映しました。` : "この日記からは、会った人物が見つかりませんでした。");
    } catch (e) {
      setSaveMsg(`人物の抽出に失敗しました。${e instanceof Error ? e.message : ""}`);
    } finally {
      setExtractingPeople(false);
    }
  };

  const startEditExpense = (e: ExpenseOut) => {
    if (e.masked) return;
    setEditingExpenseId(e.id);
    setEditForm({ account_id: e.account_id, category: e.category, amount: String(e.amount), memo: e.memo });
  };

  const saveEditExpense = async () => {
    if (!editingExpenseId) return;
    await apiPut(`/api/expenses/${editingExpenseId}`, {
      account_id: editForm.account_id,
      category: editForm.category,
      amount: Number(editForm.amount),
      memo: editForm.memo,
    });
    setEditingExpenseId(null);
    loadJournalExpenses();
  };

  const deleteJournalExpense = async (id: string) => {
    await apiDelete(`/api/expenses/${id}`);
    loadJournalExpenses();
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
      <SectionHead no="12" title="日記" sub="その日にやったこと・運動の記録。日記本文は自分だけに表示されます（運動の記録はお互いに見られます）。" />

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
        {drafting && <div className="mf-hint">✨ その日の支出からAIが下書きを作成中…</div>}
        {isAiDraft && !drafting && (
          <div className="mf-hint" style={{ color: "#F5A524" }}>
            ✨ AIがこの日の支出から下書きしました。内容を確認して保存してください（保存すると下書きの印は消えます）。
          </div>
        )}
        <textarea
          className="mf-input"
          style={{ width: "100%", minHeight: 100, resize: "vertical", fontFamily: "inherit" }}
          placeholder="今日あったこと・やったことを書く…"
          value={bodyDraft}
          onChange={(e) => {
            setBodyDraft(e.target.value);
            setIsAiDraft(false);
          }}
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
          <button className="mf-btn ghost" disabled={!bodyDraft.trim() || extracting} onClick={importMoneyFromDiary}>
            {extracting ? "インポート中…" : "📥 支出明細にインポート"}
          </button>
          <button className="mf-btn ghost" disabled={!bodyDraft.trim() || extractingPeople} onClick={extractPeopleFromDiary}>
            {extractingPeople ? "抽出中…" : "🧑 人物を抽出"}
          </button>
        </div>
        <div className="mf-hint" style={{ opacity: 0.7 }}>
          日記の内容からAIがお金の動きを推測し、支出として記録します。押すたびに、この日の日記由来の記録を最新の内容で上書きします。
        </div>
        {saveMsg && <div className="mf-hint">{saveMsg}</div>}
      </div>

      {encounters.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">この日会った人</div>
          <div className="mf-list" style={{ maxHeight: "none" }}>
            {encounters.map((e) => (
              <div key={e.id} className="mf-listrow">
                <span className="mf-listname">{e.person_raw_name}</span>
                <span className="mf-listmemo">{e.summary || "（内容の記録なし）"}</span>
                {!e.person_id && <span className="mf-hint" style={{ margin: 0, opacity: 0.6 }}>未登録</span>}
              </div>
            ))}
          </div>
          <div className="mf-hint" style={{ opacity: 0.7 }}>
            「未登録」の人物は「知人」セクションから登録すると、次回の抽出で紐づきます。会った記録は「知人」セクションで振り返れます。
          </div>
        </div>
      )}

      {journalExpenses.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">日記から記録された支出</div>
          <div className="mf-list" style={{ maxHeight: "none" }}>
            {journalExpenses.map((e) =>
              e.masked ? null : editingExpenseId === e.id ? (
                <div key={e.id} className="mf-formgrid" style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="mf-chips">
                    {accounts.map((a) => (
                      <button
                        key={a.id}
                        className={"mf-chipbtn" + (editForm.account_id === a.id ? " on" : "")}
                        onClick={() => {
                          const nextCats = categoriesForAccount(allCats, a.id);
                          setEditForm((f) => ({ ...f, account_id: a.id, category: nextCats.includes(f.category) ? f.category : nextCats[0] ?? "" }));
                        }}
                      >
                        {a.name.replace(/（.*）/, "")}
                      </button>
                    ))}
                  </div>
                  <div className="mf-chips">
                    {categoriesForAccount(allCats, editForm.account_id).map((c) => (
                      <button key={c} className={"mf-chipbtn" + (editForm.category === c ? " on" : "")} onClick={() => setEditForm({ ...editForm, category: c })}>
                        {c}
                      </button>
                    ))}
                  </div>
                  <input
                    className="mf-input mf-mono"
                    type="number"
                    placeholder="金額"
                    value={editForm.amount}
                    onChange={(e2) => setEditForm({ ...editForm, amount: e2.target.value })}
                  />
                  <input className="mf-input" placeholder="メモ" value={editForm.memo} onChange={(e2) => setEditForm({ ...editForm, memo: e2.target.value })} />
                  <div className="mf-row">
                    <button className="mf-btn primary" onClick={saveEditExpense}>
                      保存
                    </button>
                    <button className="mf-btn ghost" onClick={() => setEditingExpenseId(null)}>
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <div key={e.id} className="mf-listrow">
                  <span className="mf-listcat">{e.category}</span>
                  <span className="mf-listmemo">{e.memo}</span>
                  <span className="mf-mono mf-listamt">{fmt(e.amount)}</span>
                  <button className="mf-btn ghost" style={{ padding: "4px 8px", flex: "0 0 auto" }} onClick={() => startEditExpense(e)}>
                    編集
                  </button>
                  <button className="mf-del" onClick={() => deleteJournalExpense(e.id)}>
                    ×
                  </button>
                </div>
              )
            )}
          </div>
          <div className="mf-hint" style={{ opacity: 0.7 }}>
            日記の内容からAIが推測した支出です。金額や内容にズレがあれば編集・削除してください。
          </div>
        </div>
      )}

      <div className="mf-panel">
        <div className="mf-paneltitle">この日のスポーツ記録</div>
        {gymDays.size > 0 && (
          <PeriodCalendar
            monthKey={monthKey}
            onSelectDate={setDate}
            cellClassName={(key) => "mf-rehabcell" + (date === key ? " sel" : "") + (key === today ? " today" : "")}
            renderCell={(key, d) => (
              <>
                {d}
                {gymDays.has(key) && <span className="mf-rehabmark blue" />}
              </>
            )}
          />
        )}
        {gymDays.size > 0 && (
          <div className="mf-hint" style={{ opacity: 0.7, marginBottom: 10 }}>
            青丸はジムに行った日です（種目に「ジム」を含む記録）。
          </div>
        )}
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

      {me?.profile.slug === "haruki" ? (
        <RehabPractice date={date} onSelectDate={setDate} />
      ) : (
        <RehabCalendarBadge date={date} onSelectDate={setDate} />
      )}
    </section>
  );
}
