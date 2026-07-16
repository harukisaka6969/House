"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmt } from "@/lib/judge";
import { PRIVATE_ACCOUNT } from "@/lib/constants";
import { apiDelete, apiPost } from "@/lib/apiClient";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import AgentWidget from "./AgentWidget";

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
  const fileRef = useRef<HTMLInputElement>(null);

  if (!month) {
    return <div className="mf-quickwrap">読み込み中…</div>;
  }

  const acct = accounts.find((a) => a.id === form.account) ?? accounts[0];
  const acctSpent = acct?.spent ?? 0;
  const acctBudget = acct?.budget ?? 0;
  const meName = me?.profile.name ?? "";
  const myTotal = month.expenses.reduce((s, e) => s + (e.masked ? 0 : e.owner_name === meName ? e.amount : 0), 0);

  const promoMsg = (promoted: string[]) => (promoted.length ? ` ✨「${promoted.join("、")}」を新カテゴリにしました` : "");

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
      setMsg(`✓ 追加: ${form.category}${form.category === "その他" && form.sub ? `（${form.sub}）` : ""} ${fmt(Number(form.amount))}（${acct?.name ?? ""}）` + promoMsg(promoted));
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
      const p = (await res.json()) as { date: string | null; store: string; total: number; category: string };
      setForm((f) => ({
        ...f,
        date: p.date || f.date,
        amount: String(p.total || f.amount),
        category: allCats.includes(p.category) ? p.category : f.category,
        memo: p.store || f.memo,
      }));
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
          {monthKey.replace("-", "年")}月 ／ {meName}の支出計{" "}
          <b className="mf-mono" style={{ color: "#E7ECF2" }}>
            {fmt(myTotal)}
          </b>
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
              <button key={a.id} className={"mf-chipbtn" + (form.account === a.id ? " on" : "")} onClick={() => setForm({ ...form, account: a.id })}>
                <span className="mf-dot" style={{ background: a.color }} />
                {a.name.replace("口座", "")}
              </button>
            ))}
          </div>
          <div className="mf-numsub" style={{ marginTop: 6 }}>
            残り {fmt(Math.max(acctBudget - acctSpent, 0))}（使用 {fmt(acctSpent)} / 予算 {fmt(acctBudget)}）
            {form.account === PRIVATE_ACCOUNT && " 🔒 明細は相手に非公開"}
          </div>

          <div className="mf-steplabel">
            <span className="mf-stepnum">3</span>カテゴリ
          </div>
          <div className="mf-chips">
            {allCats.map((c) => (
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

          <button className="mf-btn primary mf-bigbtn" style={{ width: "100%", marginTop: 14 }} disabled={busy} onClick={add}>
            追加する
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
        capture="environment"
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

      {recent.length > 0 && (
        <div className="mf-panel" style={{ marginTop: 18 }}>
          <div className="mf-paneltitle">{meName}の最近の入力</div>
          <div className="mf-list">
            {recent.map((e) =>
              e.masked ? null : (
                <div key={e.id} className="mf-listrow">
                  <span className="mf-mono mf-listdate">{e.date.slice(5)}</span>
                  <span className="mf-listcat">
                    {e.category}
                    {e.sub ? `（${e.sub}）` : ""}
                  </span>
                  <span className="mf-listmemo">{e.memo}</span>
                  <span className="mf-mono mf-listamt">{fmt(e.amount)}</span>
                  <button className="mf-del" onClick={() => deleteExpense(e.id)}>
                    ×
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
