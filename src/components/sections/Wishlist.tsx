"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/lib/judge";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { WishlistItemOut } from "@/lib/apiTypes";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";
import AiSuggestButton from "../AiSuggestButton";

type Tab = "saving" | "planning" | "purchased" | "dropped";
const TABS: [Tab, string][] = [
  ["saving", "貯蓄中"],
  ["planning", "検討中"],
  ["purchased", "購入済み"],
  ["dropped", "見送り"],
];

const emptyForm = {
  name: "",
  category: "",
  price: "",
  priority: 3,
  target_date: "",
  monthly_plan: "",
  url: "",
  memo: "",
  is_private: false,
};

export default function Wishlist() {
  const { month, settings, me } = useDashboard();
  const [items, setItems] = useState<WishlistItemOut[] | null>(null);
  const [tab, setTab] = useState<Tab>("saving");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [purchaseForm, setPurchaseForm] = useState({ date: "", price: "", createExpense: false, account: "", category: "" });
  const [contributingId, setContributingId] = useState<string | null>(null);
  const [contributeForm, setContributeForm] = useState({ amount: "", createExpense: false, account: "", category: "" });
  const [purchaseErr, setPurchaseErr] = useState("");
  const [contributeErr, setContributeErr] = useState("");

  const load = () => {
    apiGet<{ items: WishlistItemOut[] }>("/api/wishlist").then((r) => setItems(r.items)).catch(() => setItems([]));
  };
  useEffect(load, []);

  if (!items) return <div className="mf-empty">読み込み中…</div>;

  const meName = me?.profile.name ?? "";
  const accounts = settings?.accounts ?? [];
  const allCats = settings ? [...new Set(items.map((i) => i.category).filter(Boolean) as string[])] : [];

  const savingItems = items.filter((i) => i.status === "saving");
  const neededTotal = savingItems.reduce((s, i) => s + Math.max(i.price - i.saved, 0), 0);
  const monthlyPlanTotal = savingItems.reduce((s, i) => s + i.monthly_plan, 0);
  const totalBudget = accounts.reduce((s, a) => s + a.budget, 0);
  const unallocated = (month?.aggregates.monthTotals.income ?? 0) - totalBudget;
  const overCapacity = monthlyPlanTotal > unallocated && unallocated > 0;

  const list = items
    .filter((i) => i.status === tab)
    .sort((a, b) => a.priority - b.priority || (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"));

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (i: WishlistItemOut) => {
    setForm({
      name: i.name,
      category: i.category ?? "",
      price: String(i.price),
      priority: i.priority,
      target_date: i.target_date ?? "",
      monthly_plan: String(i.monthly_plan || ""),
      url: i.url ?? "",
      memo: i.memo,
      is_private: i.is_private,
    });
    setEditingId(i.id);
    setShowForm(true);
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.price) return;
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      price: Number(form.price),
      priority: Number(form.priority),
      target_date: form.target_date || null,
      monthly_plan: Number(form.monthly_plan) || 0,
      url: form.url.trim() || null,
      memo: form.memo,
      is_private: form.is_private,
    };
    if (editingId) await apiPut(`/api/wishlist/${editingId}`, payload);
    else await apiPost("/api/wishlist", { ...payload, status: form.monthly_plan ? "saving" : "planning" });
    resetForm();
    load();
  };

  const setStatus = async (id: string, status: string) => {
    await apiPut(`/api/wishlist/${id}`, { status });
    load();
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/wishlist/${id}`);
    load();
  };

  const submitPurchase = async (id: string) => {
    setPurchaseErr("");
    if (!purchaseForm.price) {
      setPurchaseErr("購入価格を入力してください。");
      return;
    }
    if (purchaseForm.createExpense && (!purchaseForm.account || !purchaseForm.category)) {
      setPurchaseErr("支出として記録する場合は口座とカテゴリを選択してください。");
      return;
    }
    try {
      await apiPost(`/api/wishlist/${id}/purchase`, {
        date: purchaseForm.date || undefined,
        price: Number(purchaseForm.price),
        createExpense: purchaseForm.createExpense,
        account: purchaseForm.createExpense ? purchaseForm.account : undefined,
        category: purchaseForm.createExpense ? purchaseForm.category : undefined,
      });
      setPurchasingId(null);
      setPurchaseForm({ date: "", price: "", createExpense: false, account: "", category: "" });
      load();
    } catch (e) {
      setPurchaseErr(e instanceof Error ? e.message : "購入の記録に失敗しました。");
    }
  };

  const submitContribute = async (id: string) => {
    setContributeErr("");
    if (!contributeForm.amount) {
      setContributeErr("積立額を入力してください。");
      return;
    }
    if (contributeForm.createExpense && (!contributeForm.account || !contributeForm.category)) {
      setContributeErr("支出として記録する場合は口座とカテゴリを選択してください。");
      return;
    }
    try {
      await apiPost(`/api/wishlist/${id}/contribute`, {
        amount: Number(contributeForm.amount),
        createExpense: contributeForm.createExpense,
        account: contributeForm.createExpense ? contributeForm.account : undefined,
        category: contributeForm.createExpense ? contributeForm.category : undefined,
      });
      setContributingId(null);
      setContributeForm({ amount: "", createExpense: false, account: "", category: "" });
      load();
    } catch (e) {
      setContributeErr(e instanceof Error ? e.message : "積立の記録に失敗しました。");
    }
  };

  return (
    <section className="mf-section">
      <SectionHead no="08" title="買いたいもの" sub="車・ワインセラー等のラグジュアリー購入の計画と進捗。" />

      <div className="mf-panel">
        <div className="mf-paneltitle">貯蓄中アイテムの状況</div>
        <div className="mf-cards4" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="mf-stat">
            <div className="mf-statlabel">必要残額合計</div>
            <div className="mf-statvalue mf-mono">{fmt(neededTotal)}</div>
          </div>
          <div className="mf-stat">
            <div className="mf-statlabel">月々の積立予定合計</div>
            <div className="mf-statvalue mf-mono" style={{ color: overCapacity ? "#F26D5F" : undefined }}>
              {fmt(monthlyPlanTotal)}
            </div>
          </div>
        </div>
        {overCapacity && (
          <div className="mf-hint" style={{ color: "#F26D5F" }}>
            ⚠ 毎月の積立予定 {fmt(monthlyPlanTotal)} が未配分余力 {fmt(unallocated)} を超えています。優先度の見直しを。
          </div>
        )}
      </div>

      <div className="mf-profiletabs" style={{ marginBottom: 10 }}>
        {TABS.map(([id, label]) => (
          <button key={id} className={"mf-ptab" + (tab === id ? " active" : "")} onClick={() => setTab(id)}>
            {label} ({items.filter((i) => i.status === id).length})
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mf-empty">このタブにはまだアイテムがありません。</div>
      ) : (
        <div className="mf-acctgrid">
          {list.map((i) => {
            const rate = i.price ? Math.min(i.saved / i.price, 1) : 0;
            const monthsLeft = i.monthly_plan > 0 ? Math.ceil(Math.max(i.price - i.saved, 0) / i.monthly_plan) : null;
            const mine = i.owner_name === meName;
            return (
              <div key={i.id} className="mf-acctcard">
                <div className="mf-acctname">
                  {i.name}
                  {i.is_private && <span title="相手には非公開">🔒</span>}
                  {!mine && <span className="mf-ownerchip">{i.owner_name}</span>}
                  <span className="mf-chip" style={{ borderColor: "#8B7CF6", color: "#8B7CF6" }}>
                    優先度 {i.priority}
                  </span>
                </div>
                {i.category && <div className="mf-numsub">{i.category}</div>}
                <div className="mf-acctnums">
                  <span className="mf-num">{fmt(i.saved)}</span>
                  <span className="mf-numsub"> / {fmt(i.price)}</span>
                </div>
                {tab === "saving" && (
                  <>
                    <div className="mf-bar">
                      <div className="mf-barfill" style={{ width: `${rate * 100}%`, background: "#8B7CF6" }} />
                    </div>
                    <div className="mf-numsub" style={{ marginTop: 4 }}>
                      {monthsLeft === null ? "積立プラン未設定" : `このペースならあと${monthsLeft}ヶ月`}
                      {i.target_date && ` ／ 目標: ${i.target_date}`}
                    </div>
                  </>
                )}
                {tab === "planning" && i.target_date && <div className="mf-numsub">目標時期: {i.target_date}</div>}
                {tab === "purchased" && (
                  <div className="mf-numsub">
                    {i.purchased_date} に {fmt(i.purchased_price ?? 0)} で購入
                  </div>
                )}
                {i.memo && <div className="mf-numsub" style={{ marginTop: 4 }}>{i.memo}</div>}

                {mine && (tab === "planning" || tab === "saving") && (
                  <div className="mf-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                    <button className="mf-btn ghost" onClick={() => startEdit(i)}>
                      編集
                    </button>
                    {tab === "saving" && (
                      <button className="mf-btn ghost" onClick={() => { setContributingId(i.id); setContributeForm({ ...contributeForm, amount: "" }); }}>
                        積立を記録
                      </button>
                    )}
                    <button className="mf-btn primary" onClick={() => { setPurchasingId(i.id); setPurchaseForm({ ...purchaseForm, price: String(i.price) }); }}>
                      購入した
                    </button>
                    <button className="mf-btn ghost" onClick={() => setStatus(i.id, "dropped")}>
                      見送りにする
                    </button>
                  </div>
                )}
                {mine && tab === "dropped" && (
                  <div className="mf-row" style={{ marginTop: 10 }}>
                    <button className="mf-btn ghost" onClick={() => setStatus(i.id, "planning")}>
                      検討中に戻す
                    </button>
                    <button className="mf-del" onClick={() => remove(i.id)}>
                      削除
                    </button>
                  </div>
                )}

                {contributingId === i.id && (
                  <div className="mf-formgrid" style={{ marginTop: 10 }}>
                    <input
                      className="mf-input mf-mono"
                      type="number"
                      placeholder="積立額"
                      value={contributeForm.amount}
                      onChange={(e) => setContributeForm({ ...contributeForm, amount: e.target.value })}
                    />
                    <label className="mf-row" style={{ gap: 6 }}>
                      <input type="checkbox" checked={contributeForm.createExpense} onChange={(e) => setContributeForm({ ...contributeForm, createExpense: e.target.checked })} />
                      <span className="mf-numsub">支出としても記録する</span>
                    </label>
                    {contributeForm.createExpense && (
                      <>
                        <div className="mf-chips">
                          {accounts.map((a) => (
                            <button key={a.id} className={"mf-chipbtn" + (contributeForm.account === a.id ? " on" : "")} onClick={() => setContributeForm({ ...contributeForm, account: a.id })}>
                              {a.name.replace(/（.*）/, "")}
                            </button>
                          ))}
                        </div>
                        <div className="mf-chips">
                          {allCats.map((c) => (
                            <button key={c} className={"mf-chipbtn" + (contributeForm.category === c ? " on" : "")} onClick={() => setContributeForm({ ...contributeForm, category: c })}>
                              {c}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="mf-row">
                      <button className="mf-btn primary" onClick={() => submitContribute(i.id)}>
                        記録する
                      </button>
                      <button className="mf-btn ghost" onClick={() => { setContributingId(null); setContributeErr(""); }}>
                        キャンセル
                      </button>
                    </div>
                    {contributeErr && (
                      <div className="mf-hint" style={{ color: "#F26D5F" }}>
                        {contributeErr}
                      </div>
                    )}
                  </div>
                )}

                {purchasingId === i.id && (
                  <div className="mf-formgrid" style={{ marginTop: 10 }}>
                    <input className="mf-input" type="date" value={purchaseForm.date} onChange={(e) => setPurchaseForm({ ...purchaseForm, date: e.target.value })} />
                    <input
                      className="mf-input mf-mono"
                      type="number"
                      placeholder="購入価格"
                      value={purchaseForm.price}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, price: e.target.value })}
                    />
                    <label className="mf-row" style={{ gap: 6 }}>
                      <input type="checkbox" checked={purchaseForm.createExpense} onChange={(e) => setPurchaseForm({ ...purchaseForm, createExpense: e.target.checked })} />
                      <span className="mf-numsub">支出としても記録する（二重入力防止）</span>
                    </label>
                    {purchaseForm.createExpense && (
                      <>
                        <div className="mf-chips">
                          {accounts.map((a) => (
                            <button key={a.id} className={"mf-chipbtn" + (purchaseForm.account === a.id ? " on" : "")} onClick={() => setPurchaseForm({ ...purchaseForm, account: a.id })}>
                              {a.name.replace(/（.*）/, "")}
                            </button>
                          ))}
                        </div>
                        <div className="mf-chips">
                          {allCats.map((c) => (
                            <button key={c} className={"mf-chipbtn" + (purchaseForm.category === c ? " on" : "")} onClick={() => setPurchaseForm({ ...purchaseForm, category: c })}>
                              {c}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="mf-row">
                      <button className="mf-btn primary" onClick={() => submitPurchase(i.id)}>
                        購入を確定
                      </button>
                      <button className="mf-btn ghost" onClick={() => { setPurchasingId(null); setPurchaseErr(""); }}>
                        キャンセル
                      </button>
                    </div>
                    {purchaseErr && (
                      <div className="mf-hint" style={{ color: "#F26D5F" }}>
                        {purchaseErr}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mf-panel" style={{ marginTop: 14 }}>
        {!showForm ? (
          <button className="mf-btn primary" onClick={() => setShowForm(true)}>
            ＋ 買いたいものを追加
          </button>
        ) : (
          <>
            <div className="mf-paneltitle">{editingId ? "アイテムを編集" : "新しいアイテム"}</div>
            <div className="mf-formgrid">
              <input className="mf-input" placeholder="名前（例: ワインセラー）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <span className="mf-row" style={{ gap: 6 }}>
                <input className="mf-input" style={{ flex: 1 }} placeholder="カテゴリ（例: 家電）" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                <AiSuggestButton text={form.name} onSuggest={(c) => setForm((f) => ({ ...f, category: c }))} />
              </span>
              <input className="mf-input mf-mono" type="number" placeholder="想定価格" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <select className="mf-input" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    優先度 {p}
                  </option>
                ))}
              </select>
              <input className="mf-input" type="date" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
              <input
                className="mf-input mf-mono"
                type="number"
                placeholder="月々の積立予定額"
                value={form.monthly_plan}
                onChange={(e) => setForm({ ...form, monthly_plan: e.target.value })}
              />
              <input className="mf-input" placeholder="URL（任意）" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
              <input className="mf-input" placeholder="メモ" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
            <label className="mf-row" style={{ marginTop: 8, gap: 6 }}>
              <input type="checkbox" checked={form.is_private} onChange={(e) => setForm({ ...form, is_private: e.target.checked })} />
              <span className="mf-numsub">相手に非表示（サプライズ・個人枠。第3口座と違い合計も一切共有しません）</span>
            </label>
            <div className="mf-row" style={{ marginTop: 10 }}>
              <button className="mf-btn primary" onClick={submitForm}>
                保存
              </button>
              <button className="mf-btn ghost" onClick={resetForm}>
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
