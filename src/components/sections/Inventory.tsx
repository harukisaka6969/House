"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { InventoryItemOut } from "@/lib/apiTypes";
import { fmt } from "@/lib/judge";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";

const emptyForm = { name: "", category: "", unit: "個", quantity: "1", low_stock_threshold: "1", memo: "" };

export default function Inventory() {
  const { settings, refreshLowStock } = useDashboard();
  const [items, setItems] = useState<InventoryItemOut[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockForm, setRestockForm] = useState({ amount: "1", createExpense: false, account: "", category: "", price: "" });

  const load = () => {
    apiGet<{ items: InventoryItemOut[] }>("/api/inventory").then((r) => setItems(r.items)).catch(() => setItems([]));
  };
  useEffect(load, []);

  const afterChange = () => {
    load();
    refreshLowStock();
  };

  if (!items) return <div className="mf-empty">読み込み中…</div>;

  const accounts = settings?.accounts ?? [];
  const allCats = settings?.customCategories ?? [];
  const categories = [...new Set(items.map((i) => i.category))].sort();
  const grouped = categories.map((cat) => ({ cat, rows: items.filter((i) => i.category === cat).sort((a, b) => a.name.localeCompare(b.name, "ja")) }));

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (i: InventoryItemOut) => {
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

  const consume = async (id: string, amount: number) => {
    await apiPost(`/api/inventory/${id}/consume`, { amount });
    afterChange();
  };

  const submitRestock = async (id: string) => {
    if (!restockForm.amount) return;
    await apiPost(`/api/inventory/${id}/restock`, {
      amount: Number(restockForm.amount),
      createExpense: restockForm.createExpense,
      account: restockForm.createExpense ? restockForm.account : undefined,
      category: restockForm.createExpense ? restockForm.category : undefined,
      price: restockForm.createExpense ? Number(restockForm.price) : undefined,
    });
    setRestockingId(null);
    setRestockForm({ amount: "1", createExpense: false, account: "", category: "", price: "" });
    afterChange();
  };

  return (
    <section className="mf-section">
      <SectionHead no="11" title="在庫管理" sub="お米・ペット用品・サプリなど、減っていく消耗品の在庫と補充。" />

      {items.length === 0 ? (
        <div className="mf-empty">まだ何も登録されていません。</div>
      ) : (
        grouped.map(({ cat, rows }) => (
          <div key={cat} className="mf-panel">
            <div className="mf-paneltitle">{cat}</div>
            <div className="mf-list" style={{ maxHeight: "none" }}>
              {rows.map((i) => {
                const low = i.quantity <= i.low_stock_threshold;
                return (
                  <div key={i.id}>
                    <div className="mf-listrow">
                      <span className="mf-listname" title={i.name}>
                        {i.name}
                      </span>
                      {low && <span className="mf-badge bad">在庫少</span>}
                      <span className="mf-mono mf-listamt" style={{ color: low ? "#F26D5F" : undefined }}>
                        残り{i.quantity}{i.unit}
                      </span>
                      <button className="mf-btn ghost" style={{ padding: "4px 8px", flex: "0 0 auto" }} onClick={() => consume(i.id, 1)} disabled={i.quantity <= 0}>
                        −1
                      </button>
                      <button className="mf-btn primary" style={{ padding: "4px 10px", flex: "0 0 auto" }} onClick={() => { setRestockingId(i.id); setRestockForm({ ...restockForm, amount: "1" }); }}>
                        補充
                      </button>
                      <button className="mf-btn ghost" style={{ padding: "4px 8px", flex: "0 0 auto" }} onClick={() => startEdit(i)}>
                        編集
                      </button>
                      <button className="mf-del" onClick={() => remove(i.id)}>
                        ×
                      </button>
                    </div>
                    {restockingId === i.id && (
                      <div className="mf-formgrid" style={{ margin: "6px 0 14px" }}>
                        <input
                          className="mf-input mf-mono"
                          type="number"
                          placeholder={`補充数（${i.unit}）`}
                          value={restockForm.amount}
                          onChange={(e) => setRestockForm({ ...restockForm, amount: e.target.value })}
                        />
                        <label className="mf-row" style={{ gap: 6 }}>
                          <input type="checkbox" checked={restockForm.createExpense} onChange={(e) => setRestockForm({ ...restockForm, createExpense: e.target.checked })} />
                          <span className="mf-numsub">購入したので支出としても記録する</span>
                        </label>
                        {restockForm.createExpense && (
                          <>
                            <input
                              className="mf-input mf-mono"
                              type="number"
                              placeholder="購入金額"
                              value={restockForm.price}
                              onChange={(e) => setRestockForm({ ...restockForm, price: e.target.value })}
                            />
                            <div className="mf-chips">
                              {accounts.map((a) => (
                                <button key={a.id} className={"mf-chipbtn" + (restockForm.account === a.id ? " on" : "")} onClick={() => setRestockForm({ ...restockForm, account: a.id })}>
                                  {a.name.replace(/（.*）/, "")}
                                </button>
                              ))}
                            </div>
                            <div className="mf-chips">
                              {allCats.map((c) => (
                                <button key={c} className={"mf-chipbtn" + (restockForm.category === c ? " on" : "")} onClick={() => setRestockForm({ ...restockForm, category: c })}>
                                  {c}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        <div className="mf-row">
                          <button className="mf-btn primary" onClick={() => submitRestock(i.id)}>
                            補充を記録
                          </button>
                          <button className="mf-btn ghost" onClick={() => setRestockingId(null)}>
                            キャンセル
                          </button>
                        </div>
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
              <input className="mf-input" placeholder="名前（例: お米）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="mf-input" placeholder="カテゴリ（例: 食品）" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <input className="mf-input" placeholder="単位（例: 袋・枚・本）" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              <input
                className="mf-input mf-mono"
                type="number"
                placeholder="現在の在庫数"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
              <input
                className="mf-input mf-mono"
                type="number"
                placeholder="これ以下でアラート"
                value={form.low_stock_threshold}
                onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
              />
              <input className="mf-input" placeholder="メモ（銘柄・購入先など）" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
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
