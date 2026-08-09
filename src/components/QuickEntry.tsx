"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmt } from "@/lib/judge";
import { PRIVATE_ACCOUNT, categoriesForAccount } from "@/lib/constants";
import { apiDelete, apiGet, apiPost, apiPut, ApiClientError } from "@/lib/apiClient";
import type { SplitEventOut, SplitEventDetailOut } from "@/lib/apiTypes";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import AgentWidget from "./AgentWidget";
import AiSuggestButton from "./AiSuggestButton";

const SPLIT_RECENT_LIMIT = 5;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type Mode = "manual" | "text" | "photo";

export default function QuickEntry({ slug }: { slug: string; standalone?: boolean }) {
  return (
    <DashboardProvider slug={slug}>
      <QuickEntryInner />
      <AgentWidget />
    </DashboardProvider>
  );
}

function QuickEntryInner() {
  const router = useRouter();
  const { slug, me, month, monthKey, allCats, refreshMonth } = useDashboard();
  const accounts = month?.aggregates.perAccount ?? [];
  const [mode, setMode] = useState<Mode>("manual");
  const [form, setForm] = useState<{ date: string; account: string; category: string; amount: string; memo: string; sub: string }>({
    date: "",
    account: accounts[0]?.id ?? "a1",
    category: allCats[0] ?? "食費",
    amount: "",
    memo: "",
    sub: "",
  });
  const [showOpt, setShowOpt] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [textIn, setTextIn] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ date: string; account_id: string; category: string; sub: string; amount: string; memo: string }>({
    date: "",
    account_id: "",
    category: "",
    sub: "",
    amount: "",
    memo: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const [splitEvents, setSplitEvents] = useState<SplitEventOut[] | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<SplitEventOut | null>(null);
  const [eventDetail, setEventDetail] = useState<SplitEventDetailOut | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventName, setNewEventName] = useState("");
  const [splitForm, setSplitForm] = useState<{ amount: string; memo: string; payerId: string; beneficiaryIds: string[] }>({
    amount: "",
    memo: "",
    payerId: "",
    beneficiaryIds: [],
  });
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitMsg, setSplitMsg] = useState("");

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkEvent, setLinkEvent] = useState<SplitEventOut | null>(null);
  const [linkDetail, setLinkDetail] = useState<SplitEventDetailOut | null>(null);
  const [linkBeneficiaryIds, setLinkBeneficiaryIds] = useState<string[]>([]);

  useEffect(() => {
    apiGet<{ events: SplitEventOut[] }>("/api/split-events")
      .then((r) => setSplitEvents(r.events))
      .catch(() => setSplitEvents([]));
  }, []);

  if (!month) {
    return <div className="mf-quickwrap">読み込み中…</div>;
  }

  const acct = accounts.find((a) => a.id === form.account) ?? accounts[0];
  const acctSpent = acct?.spent ?? 0;
  const acctBudget = acct?.budget ?? 0;
  const catOptions = categoriesForAccount(allCats, form.account);
  const meName = me?.profile.name ?? "";
  // 世帯合算（ハルキ＋アリサ）の口座別支出。相手の第3口座の明細は個々には非公開だが、
  // 集計値（perAccount.spent）には相手分も含まれた真の世帯合計が入っている。
  const a1Spent = accounts.find((a) => a.id === "a1")?.spent ?? 0;
  const a3Spent = accounts.find((a) => a.id === "a3")?.spent ?? 0;

  const promoMsg = (promoted: string[]) => (promoted.length ? ` ✨「${promoted.join("、")}」を新カテゴリにしました` : "");

  const selectLinkEvent = async (ev: SplitEventOut) => {
    if (linkEvent?.id === ev.id) {
      setLinkEvent(null);
      setLinkDetail(null);
      setLinkBeneficiaryIds([]);
      return;
    }
    setLinkEvent(ev);
    setLinkDetail(null);
    try {
      const detail = await apiGet<SplitEventDetailOut>(`/api/split/${ev.share_token}`);
      setLinkDetail(detail);
      setLinkBeneficiaryIds(detail.participants.map((p) => p.id));
    } catch {
      setMsg("イベントの読み込みに失敗しました。");
    }
  };

  const toggleLinkBeneficiary = (id: string) => {
    setLinkBeneficiaryIds((ids) => (ids.includes(id) ? ids.filter((b) => b !== id) : [...ids, id]));
  };

  const add = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      setMsg("金額を入力してください。");
      return;
    }
    setBusy(true);
    try {
      const { promoted } = await apiPost<{ promoted: string[] }>("/api/expenses", {
        entries: [
          {
            date: form.date || undefined,
            account_id: form.account,
            category: form.category,
            amount: Number(form.amount),
            memo: form.memo,
            sub: form.category === "その他" ? form.sub.trim() : undefined,
          },
        ],
      });
      let splitNote = "";
      if (linkEvent && linkDetail && linkBeneficiaryIds.length > 0) {
        const payer = linkDetail.participants.find((p) => p.name === meName) ?? linkDetail.participants[0];
        if (payer) {
          try {
            await apiPost(`/api/split/${linkEvent.share_token}/expenses`, {
              payerId: payer.id,
              beneficiaryIds: linkBeneficiaryIds,
              amount: Number(form.amount),
              memo: form.memo,
              date: form.date || todayStr(),
            });
            splitNote = ` ／「${linkEvent.name}」にも登録`;
          } catch {
            splitNote = " ／ 割り勘への登録は失敗しました";
          }
        }
      }
      setMsg(`✓ 追加: ${form.category}${form.category === "その他" && form.sub ? `（${form.sub}）` : ""} ${fmt(Number(form.amount))}（${acct?.name ?? ""}）` + promoMsg(promoted) + splitNote);
      setForm((f) => ({ ...f, amount: "", memo: "", sub: "" }));
      refreshMonth();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "追加に失敗しました。");
    }
    setBusy(false);
  };

  const qText = async () => {
    if (!textIn.trim() || busy) return;
    setBusy(true);
    setMsg("文章を解析中…");
    try {
      const { entries } = await apiPost<{ entries: { date?: string; account?: string; category?: string; amount?: number; memo?: string }[] }>(
        "/api/ai/parse-text",
        { text: textIn }
      );
      const valid = entries.filter((p) => Number(p.amount) > 0);
      if (valid.length === 0) throw new Error("no entries");
      if (valid.length === 1) {
        const p = valid[0];
        setForm((f) => ({
          ...f,
          date: p.date || f.date,
          account: accounts.some((a) => a.id === p.account) ? (p.account as string) : f.account,
          amount: String(p.amount ?? f.amount),
          category: p.category && allCats.includes(p.category) ? p.category : f.category,
          memo: p.memo || f.memo,
        }));
        setMode("manual");
        setMsg(`解析成功: ${p.memo || ""} ${fmt(p.amount || 0)}（${p.category}）。内容を確認して追加してください。`);
      } else {
        const { promoted } = await apiPost<{ promoted: string[] }>("/api/expenses", {
          entries: valid.map((p) => ({
            date: p.date,
            account_id: accounts.some((a) => a.id === p.account) ? p.account : accounts[0]?.id,
            category: p.category && allCats.includes(p.category) ? p.category : "その他",
            amount: Number(p.amount),
            memo: p.memo || "",
          })),
        });
        setMsg(`✓ ${valid.length}件を追加しました。下の一覧から修正できます。` + promoMsg(promoted));
        refreshMonth();
      }
      setTextIn("");
    } catch {
      setMsg("解析に失敗しました。手入力してください。");
    }
    setBusy(false);
  };

  const onFile = async (file: File) => {
    setBusy(true);
    setMsg("レシートを読み取り中…");
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/ai/ocr", { method: "POST", body: fd });
      if (!res.ok) throw new Error("failed");
      const p = (await res.json()) as { date: string | null; store: string; total: number; category: string; account?: string };
      setForm((f) => {
        const account = accounts.some((a) => a.id === p.account) ? (p.account as string) : f.account;
        const nextCats = categoriesForAccount(allCats, account);
        return {
          ...f,
          date: p.date || f.date,
          amount: String(p.total || f.amount),
          account,
          category: nextCats.includes(p.category) ? p.category : nextCats.includes(f.category) ? f.category : nextCats[0] ?? f.category,
          memo: p.store || f.memo,
        };
      });
      setMode("manual");
      setMsg(`読み取り成功: ${p.store || "店名不明"} ${fmt(p.total || 0)}。内容を確認して追加してください。`);
    } catch {
      setMsg("読み取りに失敗しました。手入力してください。");
    }
    setBusy(false);
  };

  const deleteExpense = async (id: string) => {
    await apiDelete(`/api/expenses/${id}`);
    refreshMonth();
  };

  const startEdit = (e: { id: string; date: string; account_id: string; category: string; sub: string | null; amount: number; memo: string }) => {
    setEditingId(e.id);
    setEditForm({ date: e.date, account_id: e.account_id, category: e.category, sub: e.sub ?? "", amount: String(e.amount), memo: e.memo });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await apiPut(`/api/expenses/${editingId}`, {
      date: editForm.date,
      account_id: editForm.account_id,
      category: editForm.category,
      sub: editForm.category === "その他" ? editForm.sub.trim() : null,
      amount: Number(editForm.amount),
      memo: editForm.memo,
    });
    setEditingId(null);
    refreshMonth();
  };

  const selectEvent = async (ev: SplitEventOut) => {
    setSplitMsg("");
    if (selectedEvent?.id === ev.id) {
      setSelectedEvent(null);
      setEventDetail(null);
      return;
    }
    setSelectedEvent(ev);
    setEventDetail(null);
    try {
      const detail = await apiGet<SplitEventDetailOut>(`/api/split/${ev.share_token}`);
      setEventDetail(detail);
      const mine = detail.participants.find((p) => p.name === meName);
      setSplitForm({ amount: "", memo: "", payerId: mine?.id ?? detail.participants[0]?.id ?? "", beneficiaryIds: detail.participants.map((p) => p.id) });
    } catch {
      setSplitMsg("イベントの読み込みに失敗しました。");
    }
  };

  const createSplitEvent = async () => {
    if (!newEventName.trim() || splitBusy) return;
    setSplitBusy(true);
    setSplitMsg("");
    try {
      const { event } = await apiPost<{ event: SplitEventOut }>("/api/split-events", { name: newEventName.trim() });
      setNewEventName("");
      setShowNewEvent(false);
      const { events } = await apiGet<{ events: SplitEventOut[] }>("/api/split-events");
      setSplitEvents(events);
      await selectEvent(event);
    } catch {
      setSplitMsg("イベントの作成に失敗しました。");
    }
    setSplitBusy(false);
  };

  const toggleBeneficiary = (id: string) => {
    setSplitForm((f) => ({ ...f, beneficiaryIds: f.beneficiaryIds.includes(id) ? f.beneficiaryIds.filter((b) => b !== id) : [...f.beneficiaryIds, id] }));
  };

  const addSplitExpense = async () => {
    if (!selectedEvent || !splitForm.amount || Number(splitForm.amount) <= 0 || !splitForm.payerId || splitForm.beneficiaryIds.length === 0) {
      setSplitMsg("金額・支払った人・誰のためかを入力してください。");
      return;
    }
    setSplitBusy(true);
    setSplitMsg("");
    try {
      await apiPost(`/api/split/${selectedEvent.share_token}/expenses`, {
        payerId: splitForm.payerId,
        beneficiaryIds: splitForm.beneficiaryIds,
        amount: Number(splitForm.amount),
        memo: splitForm.memo,
        date: todayStr(),
      });
      setSplitMsg(`✓「${selectedEvent.name}」に登録しました。`);
      setSplitForm((f) => ({ ...f, amount: "", memo: "" }));
    } catch (e) {
      setSplitMsg(e instanceof ApiClientError ? e.message : "登録に失敗しました。");
    }
    setSplitBusy(false);
  };

  const recent = month.expenses
    .filter((e): e is Extract<typeof e, { masked: false }> => !e.masked && e.owner_name === meName)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <div className="mf-quickwrap">
      <div className="mf-row" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <button className="mf-btn ghost" onClick={() => router.push(`/${slug}/app`)}>
          ‹ ダッシュボード
        </button>
      </div>

      <div className="mf-quickhead">
        <span className="mf-eyebrow">QUICK ENTRY</span>
        <span className="mf-numsub">
          {monthKey.replace("-", "年")}月 ／ 世帯の支出計（第1 <b className="mf-mono" style={{ color: "#E7ECF2" }}>{fmt(a1Spent)}</b> ／ 第3{" "}
          <b className="mf-mono" style={{ color: "#E7ECF2" }}>
            {fmt(a3Spent)}
          </b>
          ）
        </span>
      </div>

      <div className="mf-modetabs">
        {(
          [
            ["manual", "⌨️ 手入力"],
            ["text", "✍️ 文章"],
            ["photo", "📷 レシート"],
          ] as [Mode, string][]
        ).map(([m2, label]) => (
          <button key={m2} className={"mf-modetab" + (mode === m2 ? " active" : "")} onClick={() => setMode(m2)}>
            {label}
          </button>
        ))}
      </div>

      {mode === "manual" && (
        <>
          <div className="mf-steplabel">
            <span className="mf-stepnum">1</span>金額
          </div>
          <input
            className="mf-input mf-mono mf-amount"
            type="number"
            inputMode="numeric"
            placeholder="¥0"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />

          <div className="mf-steplabel">
            <span className="mf-stepnum">2</span>口座
          </div>
          <div className="mf-acctchips">
            {accounts.map((a) => (
              <button
                key={a.id}
                className={"mf-chipbtn" + (form.account === a.id ? " on" : "")}
                onClick={() => {
                  const nextCats = categoriesForAccount(allCats, a.id);
                  setForm((f) => ({ ...f, account: a.id, category: nextCats.includes(f.category) ? f.category : nextCats[0] ?? "" }));
                }}
              >
                <span className="mf-dot" style={{ background: a.color }} />
                {a.name.replace("口座", "")}
              </button>
            ))}
          </div>
          <div className="mf-numsub" style={{ marginTop: 6 }}>
            残り {fmt(Math.max(acctBudget - acctSpent, 0))}（使用 {fmt(acctSpent)} / 予算 {fmt(acctBudget)}）
            {form.account === PRIVATE_ACCOUNT && " 🔒 明細は相手に非公開"}
          </div>

          <div className="mf-steplabel" style={{ justifyContent: "space-between" }}>
            <span>
              <span className="mf-stepnum">3</span>カテゴリ
            </span>
            <AiSuggestButton text={form.memo} options={catOptions} onSuggest={(c) => setForm((f) => ({ ...f, category: c }))} />
          </div>
          <div className="mf-chips">
            {catOptions.map((c) => (
              <button key={c} className={"mf-chipbtn" + (form.category === c ? " on" : "")} onClick={() => setForm({ ...form, category: c })}>
                {c}
              </button>
            ))}
          </div>
          {form.category === "その他" && (
            <>
              <input
                className="mf-input"
                style={{ marginTop: 8 }}
                placeholder="その他の内容（例: サウナ）"
                value={form.sub}
                onChange={(e) => setForm({ ...form, sub: e.target.value })}
              />
              <div className="mf-hint" style={{ opacity: 0.7 }}>
                同じ内容を3回入力すると、自動で新しいカテゴリになります。
              </div>
            </>
          )}

          <button className="mf-optbtn" onClick={() => setShowOpt(!showOpt)}>
            {showOpt ? "▾" : "▸"} 詳細を追加（メモ・日付）— 任意
          </button>
          {showOpt && (
            <>
              <div className="mf-row" style={{ marginTop: 6 }}>
                <input className="mf-input" style={{ flex: 2 }} placeholder="メモ（店名など）" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
                <input className="mf-input" style={{ flex: 1, minWidth: 130 }} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="mf-hint" style={{ opacity: 0.7 }}>
                日付を空にすると今日の日付で登録されます。
              </div>
            </>
          )}

          {splitEvents && splitEvents.length > 0 && (
            <>
              <button className="mf-optbtn" onClick={() => setLinkOpen((o) => !o)}>
                {linkOpen ? "▾" : "▸"} 🧳{linkEvent ? `「${linkEvent.name}」にも登録` : "割り勘にも登録"} — 任意
              </button>
              {linkOpen && (
                <>
                  <div className="mf-chips" style={{ marginTop: 6 }}>
                    {splitEvents.slice(0, SPLIT_RECENT_LIMIT).map((ev) => (
                      <button key={ev.id} className={"mf-chipbtn" + (linkEvent?.id === ev.id ? " on" : "")} onClick={() => selectLinkEvent(ev)}>
                        {ev.name}
                      </button>
                    ))}
                  </div>
                  {linkEvent && linkDetail && linkDetail.participants.length > 0 && (
                    <>
                      <div className="mf-hint" style={{ margin: "8px 0 4px" }}>
                        誰のための支出か
                      </div>
                      <div className="mf-chips" style={{ marginTop: 0 }}>
                        {linkDetail.participants.map((p) => (
                          <button
                            key={p.id}
                            className={"mf-chipbtn" + (linkBeneficiaryIds.includes(p.id) ? " on" : "")}
                            onClick={() => toggleLinkBeneficiary(p.id)}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          <button className="mf-btn primary mf-bigbtn" style={{ width: "100%", marginTop: 14 }} disabled={busy || (!!linkEvent && !linkDetail)} onClick={add}>
            {linkEvent && !linkDetail ? "割り勘イベントを読み込み中…" : "追加する"}
          </button>
        </>
      )}

      {mode === "text" && (
        <>
          <div className="mf-steplabel">
            <span className="mf-stepnum">✍</span>文章をそのまま書く
          </div>
          <textarea
            className="mf-input"
            rows={3}
            style={{ resize: "none", fontSize: 15, marginTop: 4 }}
            placeholder={"例: コンビニで480円でおにぎりを買った\n複数もOK: 昨日ガソリン5,000円とラーメン900円"}
            value={textIn}
            onChange={(e) => setTextIn(e.target.value)}
          />
          <div className="mf-hint" style={{ opacity: 0.7 }}>
            金額・カテゴリ・口座・日付をAIが推定します。1件なら手入力タブで確認してから追加、複数件はそのまま追加されます。日付がなければ今日として登録。
          </div>
          <button className="mf-btn primary mf-bigbtn" style={{ width: "100%", marginTop: 10 }} disabled={busy || !textIn.trim()} onClick={qText}>
            {busy ? "解析中…" : "解析する"}
          </button>
        </>
      )}

      {mode === "photo" && (
        <>
          <div className="mf-steplabel">
            <span className="mf-stepnum">📷</span>レシートを撮る・選ぶ
          </div>
          <button className="mf-photobox" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "読み取り中…" : "タップしてカメラ起動 / 画像を選択"}
          </button>
          <div className="mf-hint" style={{ opacity: 0.7 }}>
            店名・合計金額・カテゴリをAIが読み取り、手入力タブに反映します。内容を確認してから追加してください。
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {msg && (
        <div className="mf-hint" style={{ background: "#181E25", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px" }}>
          {msg}
        </div>
      )}

      {splitEvents && (
        <div className="mf-panel" style={{ marginTop: 18 }}>
          <div className="mf-paneltitle">🧳 割り勘に追加</div>
          <div className="mf-chips" style={{ marginTop: 0 }}>
            {splitEvents.slice(0, SPLIT_RECENT_LIMIT).map((ev) => (
              <button key={ev.id} className={"mf-chipbtn" + (selectedEvent?.id === ev.id ? " on" : "")} onClick={() => selectEvent(ev)}>
                {ev.name}
              </button>
            ))}
            <button className="mf-chipbtn" onClick={() => setShowNewEvent((s) => !s)}>
              + 新規
            </button>
          </div>

          {showNewEvent && (
            <div className="mf-row" style={{ marginTop: 8 }}>
              <input
                className="mf-input"
                style={{ flex: 1 }}
                placeholder="例: 軽井沢旅行"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSplitEvent()}
              />
              <button className="mf-btn ghost" disabled={splitBusy || !newEventName.trim()} onClick={createSplitEvent}>
                作成
              </button>
            </div>
          )}

          {selectedEvent && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {!eventDetail ? (
                <div className="mf-hint" style={{ margin: 0 }}>
                  読み込み中…
                </div>
              ) : eventDetail.participants.length === 0 ? (
                <div className="mf-hint" style={{ margin: 0 }}>
                  このイベントにはまだ参加者がいません。「開く」で共有リンクから参加者を追加してください。
                </div>
              ) : (
                <>
                  <div className="mf-row">
                    <input
                      className="mf-input mf-mono"
                      style={{ flex: 1 }}
                      type="number"
                      placeholder="金額"
                      value={splitForm.amount}
                      onChange={(e) => setSplitForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                    <select className="mf-input" value={splitForm.payerId} onChange={(e) => setSplitForm((f) => ({ ...f, payerId: e.target.value }))}>
                      {eventDetail.participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}が支払い
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    className="mf-input"
                    style={{ marginTop: 6 }}
                    placeholder="メモ（任意）"
                    value={splitForm.memo}
                    onChange={(e) => setSplitForm((f) => ({ ...f, memo: e.target.value }))}
                  />
                  <div className="mf-hint" style={{ margin: "8px 0 4px" }}>
                    誰のための支出か
                  </div>
                  <div className="mf-chips" style={{ marginTop: 0 }}>
                    {eventDetail.participants.map((p) => (
                      <button
                        key={p.id}
                        className={"mf-chipbtn" + (splitForm.beneficiaryIds.includes(p.id) ? " on" : "")}
                        onClick={() => toggleBeneficiary(p.id)}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <button className="mf-btn primary" style={{ marginTop: 8 }} disabled={splitBusy} onClick={addSplitExpense}>
                    割り勘に登録する
                  </button>
                </>
              )}
            </div>
          )}
          {splitMsg && <div className="mf-hint">{splitMsg}</div>}
        </div>
      )}

      {recent.length > 0 && (
        <div className="mf-panel" style={{ marginTop: 18 }}>
          <div className="mf-paneltitle">{meName}の最近の入力</div>
          <div className="mf-list">
            {recent.map((e) => {
              if (e.masked) return null;
              if (editingId === e.id) {
                return (
                  <div key={e.id} className="mf-formgrid" style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <input className="mf-input" type="date" value={editForm.date} onChange={(ev) => setEditForm((f) => ({ ...f, date: ev.target.value }))} />
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
                          {a.name.replace("口座", "")}
                        </button>
                      ))}
                    </div>
                    <div className="mf-chips">
                      {categoriesForAccount(allCats, editForm.account_id).map((c) => (
                        <button key={c} className={"mf-chipbtn" + (editForm.category === c ? " on" : "")} onClick={() => setEditForm((f) => ({ ...f, category: c }))}>
                          {c}
                        </button>
                      ))}
                    </div>
                    {editForm.category === "その他" && (
                      <input
                        className="mf-input"
                        placeholder="その他の内容"
                        value={editForm.sub}
                        onChange={(ev) => setEditForm((f) => ({ ...f, sub: ev.target.value }))}
                      />
                    )}
                    <input
                      className="mf-input mf-mono"
                      type="number"
                      placeholder="金額"
                      value={editForm.amount}
                      onChange={(ev) => setEditForm((f) => ({ ...f, amount: ev.target.value }))}
                    />
                    <input className="mf-input" placeholder="メモ" value={editForm.memo} onChange={(ev) => setEditForm((f) => ({ ...f, memo: ev.target.value }))} />
                    <div className="mf-row">
                      <button className="mf-btn primary" onClick={saveEdit}>
                        保存
                      </button>
                      <button className="mf-btn ghost" onClick={() => setEditingId(null)}>
                        キャンセル
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={e.id} className="mf-listrow">
                  <span className="mf-mono mf-listdate">{e.date.slice(5)}</span>
                  <span className="mf-listcat">
                    {e.category}
                    {e.sub ? `（${e.sub}）` : ""}
                  </span>
                  <span className="mf-listmemo">{e.memo}</span>
                  <span className="mf-mono mf-listamt">{fmt(e.amount)}</span>
                  <button className="mf-btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => startEdit(e)}>
                    編集
                  </button>
                  <button className="mf-del" onClick={() => deleteExpense(e.id)}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
