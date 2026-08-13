"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import type { SavingsActionOut } from "@/lib/apiTypes";
import { SectionHead, StatCard, MoneyViewToggle } from "../common";
import { useDashboard } from "../DashboardContext";

export default function SavingsActions() {
  const { ownerFilter } = useDashboard();
  const [actions, setActions] = useState<SavingsActionOut[] | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [bulkItems, setBulkItems] = useState<{ product: string; qty: string }[]>([{ product: "", qty: "" }]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const load = () => {
    const qs = ownerFilter ? `?owner=${ownerFilter}` : "";
    apiGet<{ actions: SavingsActionOut[] }>(`/api/savings-actions${qs}`)
      .then((r) => setActions(r.actions))
      .catch(() => setActions([]));
  };
  useEffect(load, [ownerFilter]);

  const totalSaving = useMemo(() => (actions ?? []).reduce((s, a) => s + a.estimated_saving, 0), [actions]);

  const filtered = useMemo(() => {
    if (!actions) return [];
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) =>
      [a.title, a.description, a.reasoning, ...a.keywords].some((s) => s.toLowerCase().includes(q))
    );
  }, [actions, query]);

  if (!actions) return <div className="mf-empty">読み込み中…</div>;

  const submit = async () => {
    const text = description.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setMsg("");
    try {
      await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", { description: text });
      setDescription("");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  const updateBulkItem = (idx: number, field: "product" | "qty", value: string) => {
    setBulkItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const addBulkItem = () => setBulkItems((prev) => [...prev, { product: "", qty: "" }]);
  const removeBulkItem = (idx: number) => setBulkItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  /** まとめ買いは商品数に関わらず1件のカードにまとめる（商品ごとにカードを作らない）。
   * 商品名・数量の入力から説明文を組み立て、既存のAI見積もりフローにそのまま流す。 */
  const submitBulk = async () => {
    const valid = bulkItems.filter((it) => it.product.trim());
    if (valid.length === 0 || bulkSubmitting) return;
    const text =
      "まとめ買いした: " + valid.map((it) => `${it.product.trim()}${it.qty.trim() ? `を${it.qty.trim()}` : ""}`).join("、");
    setBulkSubmitting(true);
    setBulkMsg("");
    try {
      await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", { description: text });
      setBulkItems([{ product: "", qty: "" }]);
      load();
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/savings-actions/${id}`);
    setActions((prev) => (prev ?? []).filter((a) => a.id !== id));
  };

  const repeatToday = async (id: string) => {
    if (repeatingId) return;
    setRepeatingId(id);
    setMsg("");
    try {
      await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", { duplicate_of: id });
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setRepeatingId(null);
    }
  };

  return (
    <section className="mf-section">
      <SectionHead
        no="25"
        title="節約アクション"
        sub="工夫して支出を抑えた行動を書くと、AIが経済効果を見積もってカードにします。タップで詳細を開閉でき、下に過去の履歴が並びます。キーワードで検索も可能です。"
      />
      <MoneyViewToggle />

      <div className="mf-cards4">
        <StatCard label="登録件数" value={`${actions.length}件`} color="#E7ECF2" />
        <StatCard label="累計節約額（推定）" value={fmt(totalSaving)} color="#45C48F" />
      </div>

      <div className="mf-panel">
        <label className="mf-fieldlabel" htmlFor="sv-desc">
          今日の行動
        </label>
        <textarea
          id="sv-desc"
          className="mf-input"
          rows={3}
          placeholder="例: ブルガリアヨーグルトを買う代わりに自家培養ヨーグルトを1.1キロ作った / お金の代わりに楽天ポイントを800円分使った"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button className="mf-btn primary" onClick={submit} disabled={submitting || !description.trim()}>
            {submitting ? "AIが計算中…" : "登録する"}
          </button>
        </div>
        {msg && <div className="mf-hint">{msg}</div>}
      </div>

      <div className="mf-panel">
        <label className="mf-fieldlabel">📦 まとめ買いを記録</label>
        <div className="mf-hint" style={{ margin: "0 0 8px" }}>
          商品名と数量を入力してください。商品が複数あっても、まとめ買いとして1件のカードにまとめて登録します。
        </div>
        {bulkItems.map((item, idx) => (
          <div className="mf-row" key={idx}>
            <input
              className="mf-input"
              style={{ flex: 2, minWidth: 140 }}
              placeholder="商品名（例: トイレットペーパー）"
              value={item.product}
              onChange={(e) => updateBulkItem(idx, "product", e.target.value)}
            />
            <input
              className="mf-input"
              style={{ flex: 1, minWidth: 120 }}
              placeholder="数量（例: 12ロール）"
              value={item.qty}
              onChange={(e) => updateBulkItem(idx, "qty", e.target.value)}
            />
            {bulkItems.length > 1 && (
              <button className="mf-iconbtn" onClick={() => removeBulkItem(idx)} aria-label="この商品を削除">
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="mf-row">
          <button className="mf-btn ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={addBulkItem}>
            + 商品を追加
          </button>
        </div>
        <div className="mf-row" style={{ marginTop: 10 }}>
          <button
            className="mf-btn primary"
            onClick={submitBulk}
            disabled={bulkSubmitting || !bulkItems.some((it) => it.product.trim())}
          >
            {bulkSubmitting ? "AIが計算中…" : "まとめ買いを登録する"}
          </button>
        </div>
        {bulkMsg && <div className="mf-hint">{bulkMsg}</div>}
      </div>

      <div className="mf-formgrid" style={{ marginBottom: 4 }}>
        <input
          className="mf-input"
          placeholder="🔍 キーワードで検索（例: ヨーグルト、ポイント）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mf-empty">{actions.length === 0 ? "まだ登録がありません。" : "該当するカードがありません。"}</div>
      ) : (
        <div className="sv-cards">
          {filtered.map((a) => {
            const expanded = expandedIds.has(a.id);
            return (
              <div key={a.id} className={`sv-card${expanded ? " sv-card-expanded" : ""}`}>
                <button className="sv-cardhead" onClick={() => toggleExpanded(a.id)}>
                  <span className="sv-cardemoji">{a.emoji || "💡"}</span>
                  <span className="sv-cardtitle">{a.title}</span>
                  <span className="sv-cardamount">{fmt(a.estimated_saving)}</span>
                  <span className="sv-chevron">{expanded ? "︿" : "﹀"}</span>
                </button>
                {expanded && (
                  <div className="sv-cardbody">
                    <div className="sv-cardmeta">
                      {a.date} ・ {a.owner_name}
                    </div>
                    <div className="sv-carddesc">{a.description}</div>
                    <div className="sv-cardreason">{a.reasoning}</div>
                    {a.keywords.length > 0 && (
                      <div className="mf-chips" style={{ marginTop: 8 }}>
                        {a.keywords.map((k) => (
                          <button key={k} className="mf-chipbtn" style={{ cursor: "pointer" }} onClick={() => setQuery(k)}>
                            {k}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mf-row" style={{ marginTop: 8 }}>
                      <button
                        className="mf-btn ghost"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        disabled={repeatingId === a.id}
                        onClick={() => repeatToday(a.id)}
                      >
                        {repeatingId === a.id ? "登録中…" : "🔁 今日も同じことをした"}
                      </button>
                      <button className="mf-del" onClick={() => remove(a.id)}>
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
