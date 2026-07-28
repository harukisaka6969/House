"use client";

import { useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fmt } from "@/lib/judge";
import { todayStrJST } from "@/lib/date";
import { CAT_COLORS, categoriesForAccount } from "@/lib/constants";
import { apiDelete, apiPost, apiPut } from "@/lib/apiClient";
import { TT, fmtTooltip } from "../common";
import { useDashboard } from "../DashboardContext";
import AiSuggestButton from "../AiSuggestButton";
import RecurringExpenses from "./RecurringExpenses";

export default function ExpensePanel() {
  const { month, monthKey, allCats, refreshMonth, refreshSettings, me } = useDashboard();
  const meName = me?.profile.name ?? "";
  const accounts = month?.aggregates.perAccount ?? [];
  const [entryMode, setEntryMode] = useState<"expense" | "income">("expense");
  const [form, setForm] = useState<{ date: string; account: string; category: string; amount: string; memo: string; sub: string }>({
    date: "",
    account: accounts[0]?.id ?? "a1",
    category: allCats[0] ?? "食費",
    amount: "",
    memo: "",
    sub: "",
  });
  const [incomeForm, setIncomeForm] = useState({ name: "", amount: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [textIn, setTextIn] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [filterAcct, setFilterAcct] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);

  if (!month) return null;

  const catOptions = categoriesForAccount(allCats, form.account);

  const promoMsg = (promoted: string[]) => (promoted.length ? ` ✨「${promoted.join("、")}」を新カテゴリとして追加しました。` : "");

  const addExpense = async () => {
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
      setForm((f) => ({ ...f, amount: "", memo: "", sub: "" }));
      setMsg("✓ 追加しました。" + promoMsg(promoted));
      refreshMonth();
      if (promoted.length) refreshSettings();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "追加に失敗しました。");
    }
    setBusy(false);
  };

  const addIncome = async () => {
    if (!incomeForm.amount || Number(incomeForm.amount) <= 0) {
      setMsg("金額を入力してください。");
      return;
    }
    setBusy(true);
    try {
      const next = [
        ...month.incomes.map((i) => ({ name: i.name, amount: i.amount, owner: i.owner })),
        { name: incomeForm.name.trim() || "収入", amount: Number(incomeForm.amount), owner: me?.profile.id ?? null },
      ];
      await apiPut(`/api/incomes?m=${monthKey}`, { incomes: next });
      setIncomeForm({ name: "", amount: "" });
      setMsg("✓ 収入を追加しました。");
      refreshMonth();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "追加に失敗しました。");
    }
    setBusy(false);
  };

  const runText = async () => {
    if (!textIn.trim() || textBusy) return;
    setTextBusy(true);
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
        setMsg(`解析成功: ${p.memo || ""} ${fmt(p.amount || 0)}（${p.category}）。内容を確認して「追加する」を押してください。`);
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
        setMsg(
          `${valid.length}件を追加しました: ${valid.map((p) => `${p.memo || p.category} ${fmt(p.amount || 0)}`).join(" / ")}。明細から修正できます。` +
            promoMsg(promoted)
        );
        refreshMonth();
        if (promoted.length) refreshSettings();
      }
      setTextIn("");
    } catch {
      setMsg("文章の解析に失敗しました。手入力してください。");
    }
    setTextBusy(false);
  };

  const runOcr = async (file: File) => {
    setBusy(true);
    setMsg("レシートを読み取り中…");
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/ai/ocr", { method: "POST", body: fd });
      if (!res.ok) throw new Error("failed");
      const parsed = (await res.json()) as { date: string | null; store: string; total: number; category: string };
      setForm((f) => ({
        ...f,
        date: parsed.date || f.date,
        amount: String(parsed.total || f.amount),
        category: allCats.includes(parsed.category) ? parsed.category : f.category,
        memo: parsed.store || f.memo,
      }));
      setMsg(`読み取り成功: ${parsed.store || "店名不明"} ${fmt(parsed.total || 0)}。内容を確認して追加してください。`);
    } catch {
      setMsg("読み取りに失敗しました。手入力するか、別の写真で試してください。");
    }
    setBusy(false);
  };

  const sorted = [...month.expenses]
    .filter((e) => filterAcct === "all" || e.account_id === filterAcct)
    .sort((a, b) => {
      const ad = a.masked ? "" : a.date;
      const bd = b.masked ? "" : b.date;
      return bd.localeCompare(ad);
    });
  const acctName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "—";
  const acctColor = (id: string) => accounts.find((a) => a.id === id)?.color ?? "#93A0AE";

  const deleteExpense = async (id: string) => {
    await apiDelete(`/api/expenses/${id}`);
    refreshMonth();
  };

  return (
    <>
      <div className="mf-panel">
        <div className="mf-paneltitle">{entryMode === "expense" ? "支出を追加" : "収入を追加"}</div>
        <div className="mf-chips" style={{ marginBottom: 10 }}>
          <button className={"mf-chipbtn" + (entryMode === "expense" ? " on" : "")} onClick={() => setEntryMode("expense")}>
            支出
          </button>
          <button className={"mf-chipbtn" + (entryMode === "income" ? " on" : "")} onClick={() => setEntryMode("income")}>
            収入
          </button>
        </div>

        {entryMode === "income" ? (
          <>
            <div className="mf-formgrid">
              <div>
                <label className="mf-fieldlabel" htmlFor="mf-inc-name">収入源</label>
                <input
                  id="mf-inc-name"
                  className="mf-input"
                  placeholder="例: 給与、副業"
                  value={incomeForm.name}
                  onChange={(e) => setIncomeForm({ ...incomeForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="mf-fieldlabel required" htmlFor="mf-inc-amount">金額（円）</label>
                <input
                  id="mf-inc-amount"
                  className="mf-input mf-mono"
                  type="number"
                  placeholder="例: 250000"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                />
              </div>
            </div>
            <div className="mf-hint" style={{ opacity: 0.6 }}>
              {monthKey.replace("-", "年")}月の収入として登録されます。今月の収入は「設定」からも編集できます。
            </div>
            <div className="mf-row" style={{ marginTop: 10 }}>
              <button className="mf-btn primary" disabled={busy} onClick={addIncome}>
                追加する
              </button>
            </div>
            {msg && <div className="mf-hint">{msg}</div>}
          </>
        ) : (
          <>
        <div className="mf-row" style={{ marginTop: 0, marginBottom: 10 }}>
          <input
            className="mf-input"
            style={{ flex: 1 }}
            placeholder="✍️ 文章で入力（例: コンビニで480円でおにぎりを買った）"
            value={textIn}
            onChange={(e) => setTextIn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runText();
            }}
          />
          <button className="mf-btn ghost" disabled={textBusy || !textIn.trim()} onClick={runText}>
            {textBusy ? "解析中…" : "解析"}
          </button>
        </div>
        <div className="mf-formgrid">
          <div>
            <label className="mf-fieldlabel" htmlFor="mf-exp-date">日付</label>
            <input id="mf-exp-date" className="mf-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="mf-fieldlabel" htmlFor="mf-exp-account">口座</label>
            <select
              id="mf-exp-account"
              className="mf-input"
              value={form.account}
              onChange={(e) => {
                const nextCats = categoriesForAccount(allCats, e.target.value);
                setForm((f) => ({ ...f, account: e.target.value, category: nextCats.includes(f.category) ? f.category : nextCats[0] ?? "" }));
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mf-fieldlabel required" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>カテゴリ</span>
              <AiSuggestButton text={form.memo} options={catOptions} onSuggest={(c) => setForm((f) => ({ ...f, category: c }))} />
            </div>
            <select className="mf-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {catOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mf-fieldlabel required" htmlFor="mf-exp-amount">金額（円）</label>
            <input id="mf-exp-amount" className="mf-input mf-mono" type="number" placeholder="例: 480" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="mf-fieldlabel" htmlFor="mf-exp-memo">メモ（任意）</label>
            <input id="mf-exp-memo" className="mf-input" placeholder="例: コンビニ" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
          </div>
        </div>
        {form.category === "その他" && (
          <div style={{ marginTop: 8 }}>
            <input className="mf-input" placeholder="その他の内容（例: サウナ）" value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} />
            <div className="mf-hint" style={{ opacity: 0.7 }}>
              同じ内容を3回入力すると、自動で新しいカテゴリになります。
            </div>
          </div>
        )}
        <div className="mf-hint" style={{ opacity: 0.6 }}>
          日付を空にすると今日（{todayStrJST()}）の日付で登録されます。
        </div>
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" disabled={busy} onClick={addExpense}>
            追加する
          </button>
          <button className="mf-btn ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "処理中…" : "📷 レシートから読み取る"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) runOcr(f);
              e.target.value = "";
            }}
          />
        </div>
        {msg && <div className="mf-hint">{msg}</div>}
          </>
        )}
      </div>

      <RecurringExpenses />

      {month.aggregates.perCategory.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">カテゴリ別内訳</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={month.aggregates.perCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {month.aggregates.perCategory.map((c, i) => (
                    <Cell key={c.name} fill={CAT_COLORS[i % CAT_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={TT} formatter={fmtTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mf-hint" style={{ opacity: 0.7 }}>
            第3口座の相手の入力は金額非公開のため、この内訳には含まれません。
          </div>
        </div>
      )}

      <div className="mf-panel">
        <div className="mf-paneltitle">明細（{sorted.length}件）</div>
        <div className="mf-chips" style={{ marginBottom: 8 }}>
          <button className={"mf-chipbtn" + (filterAcct === "all" ? " on" : "")} onClick={() => setFilterAcct("all")}>
            全て
          </button>
          {accounts.map((a) => (
            <button key={a.id} className={"mf-chipbtn" + (filterAcct === a.id ? " on" : "")} onClick={() => setFilterAcct(a.id)}>
              <span className="mf-dot" style={{ background: a.color }} />
              {a.name.replace(/（.*）/, "")}
            </button>
          ))}
        </div>
        {sorted.length === 0 ? (
          <div className="mf-empty">まだ支出がありません。上のフォームかレシート写真から追加できます。</div>
        ) : (
          <div className="mf-list">
            {sorted.map((e) => {
              const masked = e.masked;
              return (
                <div key={e.id} className="mf-listrow" style={masked ? { opacity: 0.75 } : undefined}>
                  <span className="mf-mono mf-listdate">{masked ? "—" : e.date.slice(5)}</span>
                  <span className="mf-dot" style={{ background: acctColor(e.account_id) }} title={acctName(e.account_id)} />
                  <span className="mf-listcat">
                    {e.category}
                    {!masked && e.sub ? `（${e.sub}）` : ""}
                  </span>
                  {e.owner_name !== meName && <span className="mf-ownerchip">{e.owner_name}</span>}
                  <span className="mf-listmemo">{masked ? "🔒 非公開" : e.memo}</span>
                  <span className="mf-mono mf-listamt">{masked ? "¥•••••" : fmt(e.amount)}</span>
                  {!masked ? (
                    <button className="mf-del" onClick={() => deleteExpense(e.id)}>
                      ×
                    </button>
                  ) : (
                    <span className="mf-del" style={{ cursor: "default", opacity: 0.3 }} title="相手の記録は削除できません">
                      ·
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
