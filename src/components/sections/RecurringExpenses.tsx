"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/judge";
import { categoriesForAccount } from "@/lib/constants";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { RecurringExpenseOut } from "@/lib/apiTypes";
import { useDashboard } from "../DashboardContext";

export default function RecurringExpenses() {
  const { month, allCats } = useDashboard();
  const accounts = month?.aggregates.perAccount ?? [];
  const [items, setItems] = useState<RecurringExpenseOut[] | null>(null);
  const [msg, setMsg] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{ account: string; category: string; amount: string; memo: string; day: string }>({
    account: accounts[0]?.id ?? "a1",
    category: allCats[0] ?? "食費",
    amount: "",
    memo: "",
    day: "1",
  });

  const load = () => {
    apiGet<{ items: RecurringExpenseOut[] }>("/api/recurring-expenses")
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  };
  useEffect(load, []);

  if (!month || items === null) return null;

  const catOptions = categoriesForAccount(allCats, form.account);
  const acctName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  const add = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      setMsg("金額を入力してください。");
      return;
    }
    try {
      await apiPost("/api/recurring-expenses", {
        account_id: form.account,
        category: form.category,
        amount: Number(form.amount),
        memo: form.memo,
        day_of_month: Number(form.day),
      });
      setForm({ ...form, amount: "", memo: "" });
      setShowAdd(false);
      setMsg("✓ 定期支払を登録しました。毎月この日に自動で支出明細へ追加されます。");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    }
  };

  const toggleActive = async (item: RecurringExpenseOut) => {
    await apiPut(`/api/recurring-expenses/${item.id}`, { active: !item.active });
    load();
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/recurring-expenses/${id}`);
    load();
  };

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">定期支払（サブスク・保険など）</div>
      <div className="mf-hint" style={{ opacity: 0.7, marginBottom: 10 }}>
        登録した日に、毎月自動で支出明細に追加されます（29〜31日は月によって存在しないため1〜28日のみ指定できます）。
      </div>

      {items.length > 0 && (
        <div className="mf-list" style={{ marginBottom: 10 }}>
          {items.map((it) => (
            <div key={it.id} className="mf-listrow" style={!it.active ? { opacity: 0.5 } : undefined}>
              <span className="mf-mono mf-listdate">毎月{it.day_of_month}日</span>
              <span className="mf-listcat">{it.category}</span>
              <span className="mf-listmemo">
                {acctName(it.account_id)}
                {it.memo ? `（${it.memo}）` : ""}
              </span>
              <span className="mf-mono mf-listamt">{fmt(it.amount)}</span>
              <button className="mf-btn ghost" style={{ padding: "4px 8px", flex: "0 0 auto" }} onClick={() => toggleActive(it)}>
                {it.active ? "停止" : "再開"}
              </button>
              <button className="mf-del" onClick={() => remove(it.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <div>
          <div className="mf-formgrid">
            <div>
              <label className="mf-fieldlabel" htmlFor="mf-rec-account">口座</label>
              <select
                id="mf-rec-account"
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
              <label className="mf-fieldlabel" htmlFor="mf-rec-category">カテゴリ</label>
              <select id="mf-rec-category" className="mf-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {catOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mf-fieldlabel required" htmlFor="mf-rec-amount">金額（円）</label>
              <input
                id="mf-rec-amount"
                className="mf-input mf-mono"
                type="number"
                placeholder="例: 1980"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="mf-fieldlabel required" htmlFor="mf-rec-day">支払日（毎月）</label>
              <input
                id="mf-rec-day"
                className="mf-input mf-mono"
                type="number"
                min={1}
                max={28}
                value={form.day}
                onChange={(e) => setForm({ ...form, day: e.target.value })}
              />
            </div>
            <div>
              <label className="mf-fieldlabel" htmlFor="mf-rec-memo">メモ（任意）</label>
              <input
                id="mf-rec-memo"
                className="mf-input"
                placeholder="例: Netflix、生命保険"
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
              />
            </div>
          </div>
          <div className="mf-row" style={{ marginTop: 10 }}>
            <button className="mf-btn primary" onClick={add}>
              登録する
            </button>
            <button className="mf-btn ghost" onClick={() => setShowAdd(false)}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button className="mf-btn ghost" onClick={() => setShowAdd(true)}>
          ＋ 定期支払を追加
        </button>
      )}
      {msg && <div className="mf-hint">{msg}</div>}
    </div>
  );
}
