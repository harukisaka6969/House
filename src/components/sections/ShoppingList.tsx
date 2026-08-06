"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/apiClient";
import type { ShoppingItemOut, ShoppingStore } from "@/lib/apiTypes";
import { SectionHead } from "../common";
import { useDashboard } from "../DashboardContext";

const STORE_LABEL: Record<ShoppingStore, string> = { seiyu: "西友", amazon: "Amazon", conveni: "コンビニ", other: "その他" };
const STORES: ShoppingStore[] = ["seiyu", "amazon", "conveni", "other"];

export default function ShoppingList() {
  const { me } = useDashboard();
  const myId = me?.profile.id ?? "";
  const [items, setItems] = useState<ShoppingItemOut[] | null>(null);
  const [name, setName] = useState("");
  const [store, setStore] = useState<ShoppingStore>("seiyu");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    apiGet<{ items: ShoppingItemOut[] }>("/api/shopping-items")
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  };
  useEffect(load, []);
  useEffect(() => {
    apiPost("/api/notifications/mark-seen", { kind: "shopping" }).catch(() => {});
  }, []);

  if (!items) return <div className="mf-empty">読み込み中…</div>;

  const pending = items.filter((i) => !i.bought);
  const bought = items.filter((i) => i.bought);
  const canBuy = (i: ShoppingItemOut) => !i.needs_approval || i.approved;

  const add = async () => {
    if (!name.trim()) {
      setMsg("品目名を入力してください。");
      return;
    }
    try {
      await apiPost("/api/shopping-items", { name: name.trim(), store });
      setName("");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "追加に失敗しました。");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buySelected = async () => {
    setBusy(true);
    try {
      await Promise.all(Array.from(selected).map((id) => apiPut(`/api/shopping-items/${id}`, { bought: true })));
      setSelected(new Set());
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新に失敗しました。");
    }
    setBusy(false);
  };

  const revert = async (id: string) => {
    await apiPut(`/api/shopping-items/${id}`, { bought: false });
    load();
  };

  const approve = async (id: string) => {
    try {
      await apiPost(`/api/shopping-items/${id}/approve`, {});
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "承認に失敗しました。");
    }
  };

  const notifySeiyu = async () => {
    setMsg("");
    try {
      const r = await apiPost<{ count: number }>("/api/shopping-items/notify-seiyu", {});
      setMsg(`✓ 西友の買い物リスト（${r.count}件）をLINEに送りました。`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "送信に失敗しました。");
    }
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/shopping-items/${id}`);
    setSelected((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    load();
  };

  return (
    <section className="mf-section">
      <SectionHead
        no="16"
        title="買い物リスト"
        sub="ふたりで共有するリストです。Amazon・その他で買うものは、追加した本人以外の承認が必要です。"
      />

      <div className="mf-panel">
        <div className="mf-paneltitle">品目を追加</div>
        <div className="mf-row" style={{ marginBottom: 8 }}>
          <input
            className="mf-input"
            style={{ flex: 1 }}
            placeholder="例: 牛乳"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
        </div>
        <div className="mf-chips" style={{ marginBottom: 10 }}>
          {STORES.map((s) => (
            <button key={s} className={"mf-chipbtn" + (store === s ? " on" : "")} onClick={() => setStore(s)}>
              {STORE_LABEL[s]}
            </button>
          ))}
        </div>
        <button className="mf-btn primary" onClick={add}>
          追加する
        </button>
        {msg && <div className="mf-hint">{msg}</div>}
      </div>

      <div className="mf-panel">
        <div className="mf-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="mf-paneltitle" style={{ margin: 0 }}>
            買うもの（{pending.length}件）
          </div>
          <button className="mf-btn ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={notifySeiyu}>
            🛒 西友の分をLINEに送る
          </button>
        </div>
        {selected.size > 0 && (
          <div className="mf-row" style={{ marginBottom: 10 }}>
            <button className="mf-btn primary" disabled={busy} onClick={buySelected}>
              選択した{selected.size}件を購入済みにする
            </button>
            <button className="mf-btn ghost" onClick={() => setSelected(new Set())}>
              選択解除
            </button>
          </div>
        )}
        {pending.length === 0 ? (
          <div className="mf-empty">買うものはありません。</div>
        ) : (
          <div className="mf-list" style={{ maxHeight: "none" }}>
            {pending.map((i) => (
              <div key={i.id} className="mf-shopitem">
                <div className="mf-row" style={{ gap: 10 }}>
                  {canBuy(i) ? (
                    <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)} />
                  ) : (
                    <span style={{ width: 16, flex: "0 0 auto" }} />
                  )}
                  <span className="mf-shopname">{i.name}</span>
                  <button className="mf-del" onClick={() => remove(i.id)}>
                    ×
                  </button>
                </div>
                <div className="mf-row" style={{ gap: 6, marginTop: 4, marginLeft: 26 }}>
                  <span className="mf-listcat">{STORE_LABEL[i.store]}</span>
                  {i.owner !== myId && <span className="mf-ownerchip">{i.owner_name}</span>}
                  {i.needs_approval && !i.approved && i.owner !== myId && (
                    <button className="mf-btn ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => approve(i.id)}>
                      承認する
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {bought.length > 0 && (
        <div className="mf-panel">
          <div className="mf-paneltitle">購入済み（{bought.length}件）</div>
          <div className="mf-list" style={{ maxHeight: "none" }}>
            {bought.map((i) => (
              <div key={i.id} className="mf-shopitem" style={{ opacity: 0.55 }}>
                <div className="mf-row" style={{ gap: 10 }}>
                  <span className="mf-shopname" style={{ textDecoration: "line-through" }}>
                    {i.name}
                  </span>
                  <button className="mf-del" onClick={() => remove(i.id)}>
                    ×
                  </button>
                </div>
                <div className="mf-row" style={{ gap: 6, marginTop: 4 }}>
                  <span className="mf-listcat">{STORE_LABEL[i.store]}</span>
                  {i.owner !== myId && <span className="mf-ownerchip">{i.owner_name}</span>}
                  <button className="mf-btn ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => revert(i.id)}>
                    戻す
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
