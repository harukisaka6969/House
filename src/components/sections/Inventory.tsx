"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { InventoryItemDetailOut } from "@/lib/apiTypes";
import { fmt } from "@/lib/judge";
import { categoriesForAccount } from "@/lib/constants";
import { todayStrJST } from "@/lib/date";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";
import AiSuggestButton from "../AiSuggestButton";

const emptyForm = { name: "", category: "", unit: "個", quantity: "1", low_stock_threshold: "1", memo: "" };

/** ラベル無しのplaceholderだけだと、入力後に何のフィールドか分からなくなる（focus/入力済みで
 * placeholderが消えるため）ので、常に見えるラベルを添える共通ラッパー。 */
function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mf-fieldlabel" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function paceText(item: InventoryItemDetailOut): string {
  if (item.weeklyPace == null) return "消費データがまだありません（「使った」を記録すると出ます）";
  const pace = item.weeklyPace >= 10 ? Math.round(item.weeklyPace) : Math.round(item.weeklyPace * 10) / 10;
  const paceStr = `週あたり約${pace}${item.unit}のペース`;
  if (item.daysUntilEmpty == null) return paceStr;
  if (item.daysUntilEmpty <= 0) return `${paceStr}・在庫切れの見込み`;
  return `${paceStr}・あと約${item.daysUntilEmpty}日でなくなる見込み`;
}

export default function Inventory() {
  const { settings, refreshLowStock } = useDashboard();
  const [items, setItems] = useState<InventoryItemDetailOut[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockForm, setRestockForm] = useState({ amount: "1", date: todayStrJST(), createExpense: false, account: "", category: "", price: "" });
  const [restockErr, setRestockErr] = useState("");
  const [consumingId, setConsumingId] = useState<string | null>(null);
  const [consumeForm, setConsumeForm] = useState({ amount: "1", date: todayStrJST() });
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);

  const load = () => {
    apiGet<{ items: InventoryItemDetailOut[] }>("/api/inventory").then((r) => setItems(r.items)).catch(() => setItems([]));
  };
  useEffect(load, []);

  const afterChange = () => {
    load();
    refreshLowStock();
  };

  if (!items) return <div className="mf-empty">読み込み中…</div>;

  const accounts = settings?.accounts ?? [];
  const expenseCats = settings?.allCategories ?? [];
  const categories = [...new Set(items.map((i) => i.category))].sort();
  const grouped = categories.map((cat) => ({ cat, rows: items.filter((i) => i.category === cat).sort((a, b) => a.name.localeCompare(b.name, "ja")) }));

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (i: InventoryItemDetailOut) => {
    setForm({
      name: i.name,
      category: i.category,
      unit: i.unit,
      quantity: String(i.quantity),
      low_stock_threshold: String(i.low_stock_threshold),
      memo: i.memo,
    });
    setEditingId(i.id);
    setShowForm(true);
  };

  const submitForm = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || "その他",
      unit: form.unit.trim() || "個",
      quantity: Number(form.quantity) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 0,
      memo: form.memo,
    };
    if (editingId) await apiPut(`/api/inventory/${editingId}`, payload);
    else await apiPost("/api/inventory", payload);
    resetForm();
    afterChange();
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/inventory/${id}`);
    afterChange();
  };

  const quickConsume = async (id: string, amount: number) => {
    await apiPost(`/api/inventory/${id}/consume`, { amount, date: todayStrJST() });
    afterChange();
  };

  const submitConsume = async (id: string) => {
    const amount = Number(consumeForm.amount);
    if (!amount || amount <= 0) return;
    await apiPost(`/api/inventory/${id}/consume`, { amount, date: consumeForm.date || todayStrJST() });
    setConsumingId(null);
    setConsumeForm({ amount: "1", date: todayStrJST() });
    afterChange();
  };

  const submitRestock = async (id: string) => {
    setRestockErr("");
    if (!restockForm.amount) {
      setRestockErr("購入数を入力してください。");
      return;
    }
    if (restockForm.createExpense && (!restockForm.account || !restockForm.category || !restockForm.price)) {
      setRestockErr("支出として記録する場合は金額・口座・カテゴリをすべて入力してください。");
      return;
    }
    try {
      await apiPost(`/api/inventory/${id}/restock`, {
        amount: Number(restockForm.amount),
        date: restockForm.date || todayStrJST(),
        createExpense: restockForm.createExpense,
        account: restockForm.createExpense ? restockForm.account : undefined,
        category: restockForm.createExpense ? restockForm.category : undefined,
        price: restockForm.createExpense ? Number(restockForm.price) : undefined,
      });
      setRestockingId(null);
      setRestockForm({ amount: "1", date: todayStrJST(), createExpense: false, account: "", category: "", price: "" });
      afterChange();
    } catch (e) {
      setRestockErr(e instanceof Error ? e.message : "購入の記録に失敗しました。");
    }
  };

  return (
    <section className="mf-section">
      <SectionHead
        no="11"
        title="在庫管理"
        sub="お米・ペット用品・サプリなど、減っていく消耗品の在庫と補充。「購入した」「使った」を記録すると、消費ペースと在庫切れの見込みが自動でわかります。"
      />

      {items.length === 0 ? (
        <div className="mf-empty">まだ何も登録されていません。下の「＋ アイテムを追加」から登録してください。</div>
      ) : (
        grouped.map(({ cat, rows }) => (
          <div key={cat} className="mf-panel">
            <div className="mf-paneltitle">{cat}</div>
            <div className="mf-list" style={{ maxHeight: "none" }}>
              {rows.map((i) => {
                const low = i.quantity <= i.low_stock_threshold;
                return (
                  <div key={i.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="mf-listrow" style={{ marginBottom: 2 }}>
                      <span className="mf-listname" title={i.name}>
                        {i.name}
                      </span>
                      {low && <span className="mf-badge bad">在庫少</span>}
                      <span className="mf-mono mf-listamt" style={{ color: low ? "#F26D5F" : undefined, fontSize: 16 }}>
                        残り{i.quantity}{i.unit}
                      </span>
                    </div>
                    <div className="mf-hint" style={{ margin: "0 0 8px", opacity: 0.75 }}>
                      {paceText(i)}
                    </div>
                    <div className="mf-row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <button className="mf-btn ghost" style={{ padding: "4px 8px", flex: "0 0 auto" }} onClick={() => quickConsume(i.id, 1)} disabled={i.quantity <= 0}>
                        −1 使った
                      </button>
                      <button
                        className="mf-btn ghost"
                        style={{ padding: "4px 8px", flex: "0 0 auto" }}
                        onClick={() => {
                          setConsumingId(consumingId === i.id ? null : i.id);
                          setConsumeForm({ amount: "1", date: todayStrJST() });
                        }}
                      >
                        使った数を記録
                      </button>
                      <button
                        className="mf-btn primary"
                        style={{ padding: "4px 10px", flex: "0 0 auto" }}
                        onClick={() => {
                          setRestockingId(restockingId === i.id ? null : i.id);
                          setRestockForm({ ...restockForm, amount: "1", date: todayStrJST() });
                        }}
                      >
                        購入した
                      </button>
                      <button className="mf-btn ghost" style={{ padding: "4px 8px", flex: "0 0 auto" }} onClick={() => startEdit(i)}>
                        編集
                      </button>
                      <button className="mf-del" onClick={() => remove(i.id)}>
                        ×
                      </button>
                    </div>

                    {consumingId === i.id && (
                      <div className="mf-formgrid" style={{ margin: "10px 0" }}>
                        <Field label={`使った数（${i.unit}）`} htmlFor={`inv-consume-amount-${i.id}`}>
                          <input
                            id={`inv-consume-amount-${i.id}`}
                            className="mf-input mf-mono"
                            type="number"
                            value={consumeForm.amount}
                            onChange={(e) => setConsumeForm({ ...consumeForm, amount: e.target.value })}
                          />
                        </Field>
                        <Field label="使った日" htmlFor={`inv-consume-date-${i.id}`}>
                          <input
                            id={`inv-consume-date-${i.id}`}
                            className="mf-input mf-mono"
                            type="date"
                            value={consumeForm.date}
                            onChange={(e) => setConsumeForm({ ...consumeForm, date: e.target.value })}
                          />
                        </Field>
                        <div className="mf-row">
                          <button className="mf-btn primary" onClick={() => submitConsume(i.id)}>
                            記録する
                          </button>
                          <button className="mf-btn ghost" onClick={() => setConsumingId(null)}>
                            キャンセル
                          </button>
                        </div>
                      </div>
                    )}

                    {restockingId === i.id && (
                      <div className="mf-formgrid" style={{ margin: "10px 0" }}>
                        <Field label={`購入数（${i.unit}）`} htmlFor={`inv-restock-amount-${i.id}`}>
                          <input
                            id={`inv-restock-amount-${i.id}`}
                            className="mf-input mf-mono"
                            type="number"
                            value={restockForm.amount}
                            onChange={(e) => setRestockForm({ ...restockForm, amount: e.target.value })}
                          />
                        </Field>
                        <Field label="購入日" htmlFor={`inv-restock-date-${i.id}`}>
                          <input
                            id={`inv-restock-date-${i.id}`}
                            className="mf-input mf-mono"
                            type="date"
                            value={restockForm.date}
                            onChange={(e) => setRestockForm({ ...restockForm, date: e.target.value })}
                          />
                        </Field>
                        <label className="mf-row" style={{ gap: 6 }}>
                          <input type="checkbox" checked={restockForm.createExpense} onChange={(e) => setRestockForm({ ...restockForm, createExpense: e.target.checked })} />
                          <span className="mf-numsub">購入したので支出としても記録する</span>
                        </label>
                        {restockForm.createExpense && (
                          <>
                            <Field label="購入金額" htmlFor={`inv-restock-price-${i.id}`}>
                              <input
                                id={`inv-restock-price-${i.id}`}
                                className="mf-input mf-mono"
                                type="number"
                                value={restockForm.price}
                                onChange={(e) => setRestockForm({ ...restockForm, price: e.target.value })}
                              />
                            </Field>
                            <Field label="口座">
                              <div className="mf-chips">
                                {accounts.map((a) => (
                                  <button
                                    key={a.id}
                                    className={"mf-chipbtn" + (restockForm.account === a.id ? " on" : "")}
                                    onClick={() => {
                                      const nextCats = categoriesForAccount(expenseCats, a.id);
                                      setRestockForm((f) => ({ ...f, account: a.id, category: nextCats.includes(f.category) ? f.category : nextCats[0] ?? "" }));
                                    }}
                                  >
                                    {a.name.replace(/（.*）/, "")}
                                  </button>
                                ))}
                              </div>
                            </Field>
                            <Field label="カテゴリ">
                              <div className="mf-chips">
                                {categoriesForAccount(expenseCats, restockForm.account).map((c) => (
                                  <button key={c} className={"mf-chipbtn" + (restockForm.category === c ? " on" : "")} onClick={() => setRestockForm({ ...restockForm, category: c })}>
                                    {c}
                                  </button>
                                ))}
                              </div>
                            </Field>
                          </>
                        )}
                        <div className="mf-row">
                          <button className="mf-btn primary" onClick={() => submitRestock(i.id)}>
                            購入を記録
                          </button>
                          <button className="mf-btn ghost" onClick={() => { setRestockingId(null); setRestockErr(""); }}>
                            キャンセル
                          </button>
                        </div>
                        {restockErr && (
                          <div className="mf-hint" style={{ color: "#F26D5F" }}>
                            {restockErr}
                          </div>
                        )}
                      </div>
                    )}

                    {i.recentEvents.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <button
                          className="mf-btn ghost"
                          style={{ padding: "2px 8px", fontSize: 12 }}
                          onClick={() => setHistoryOpenId(historyOpenId === i.id ? null : i.id)}
                        >
                          {historyOpenId === i.id ? "▾ 履歴を閉じる" : `▸ 履歴を見る（${i.recentEvents.length}件）`}
                        </button>
                        {historyOpenId === i.id && (
                          <div className="mf-hint" style={{ marginTop: 6, opacity: 0.8, lineHeight: 1.8 }}>
                            {i.recentEvents.map((e) => (
                              <div key={e.id}>
                                {e.date.slice(5).replace("-", "/")}　{e.kind === "restock" ? "＋" : "－"}
                                {e.amount}{i.unit}　{e.kind === "restock" ? "購入" : "使用"}
                                {e.price != null && `（${fmt(e.price)}）`}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <div className="mf-panel">
        {!showForm ? (
          <button className="mf-btn primary" onClick={() => setShowForm(true)}>
            ＋ アイテムを追加
          </button>
        ) : (
          <>
            <div className="mf-paneltitle">{editingId ? "アイテムを編集" : "新しいアイテム"}</div>
            <div className="mf-formgrid">
              <Field label="名前" htmlFor="inv-name">
                <input id="inv-name" className="mf-input" placeholder="例: お米" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="カテゴリ" htmlFor="inv-category">
                <span className="mf-row" style={{ gap: 6 }}>
                  <input
                    id="inv-category"
                    className="mf-input"
                    style={{ flex: 1 }}
                    placeholder="例: 食品"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                  <AiSuggestButton text={form.name} onSuggest={(c) => setForm((f) => ({ ...f, category: c }))} />
                </span>
              </Field>
              <Field label="単位" htmlFor="inv-unit">
                <input id="inv-unit" className="mf-input" placeholder="例: 袋・枚・本" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </Field>
              <Field label={editingId ? "現在の在庫数" : "今の在庫数（初期値）"} htmlFor="inv-quantity">
                <input
                  id="inv-quantity"
                  className="mf-input mf-mono"
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </Field>
              <Field label="これ以下でアラート" htmlFor="inv-threshold">
                <input
                  id="inv-threshold"
                  className="mf-input mf-mono"
                  type="number"
                  value={form.low_stock_threshold}
                  onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                />
              </Field>
              <Field label="メモ" htmlFor="inv-memo">
                <input id="inv-memo" className="mf-input" placeholder="銘柄・購入先など" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
              </Field>
            </div>
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
