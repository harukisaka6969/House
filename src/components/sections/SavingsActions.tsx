"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import type { SavingsActionOut } from "@/lib/apiTypes";
import { SectionHead, StatCard, MoneyViewToggle } from "../common";
import { useDashboard } from "../DashboardContext";

const BULK_PREFIX = "まとめ買いした: ";

/** 過去の「まとめ買いを記録」カードの説明文（"商品名(数量)、商品名(数量)"形式）から、
 * 商品名だけを重複なく取り出す。カード内での再選択用（同じ商品を毎回打ち直さなくて済むように）。 */
function extractPastBulkItems(actions: SavingsActionOut[]): string[] {
  const seen = new Set<string>();
  for (const a of actions) {
    if (!a.description.startsWith(BULK_PREFIX)) continue;
    const rest = a.description.slice(BULK_PREFIX.length);
    for (const seg of rest.split("、")) {
      const name = seg.replace(/\([^)]*\)\s*$/, "").trim();
      if (name) seen.add(name);
    }
  }
  return Array.from(seen).slice(0, 24);
}

export default function SavingsActions() {
  const { ownerFilter } = useDashboard();
  const [actions, setActions] = useState<SavingsActionOut[] | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [bulkExpanded, setBulkExpanded] = useState(false);
  const [bulkItems, setBulkItems] = useState<{ product: string; qty: string; price: string }[]>([
    { product: "", qty: "", price: "" },
  ]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [discountExpanded, setDiscountExpanded] = useState(false);
  const [discountItem, setDiscountItem] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [discountSubmitting, setDiscountSubmitting] = useState(false);
  const [discountMsg, setDiscountMsg] = useState("");

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

  const pastBulkItems = useMemo(() => extractPastBulkItems(actions ?? []), [actions]);

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

  const updateBulkItem = (idx: number, field: "product" | "qty" | "price", value: string) => {
    setBulkItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const addBulkItem = () => setBulkItems((prev) => [...prev, { product: "", qty: "", price: "" }]);
  const removeBulkItem = (idx: number) => setBulkItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  /** 過去のまとめ買いで使った商品名をタップしたら、空いている商品欄に入れる（無ければ行を追加）。 */
  const pickBulkItem = (name: string) => {
    setBulkItems((prev) => {
      const emptyIdx = prev.findIndex((it) => !it.product.trim());
      if (emptyIdx !== -1) return prev.map((it, i) => (i === emptyIdx ? { ...it, product: name } : it));
      return [...prev, { product: name, qty: "", price: "" }];
    });
  };

  /** まとめ買いは商品数に関わらず1件のカードにまとめる（商品ごとにカードを作らない）。
   * 商品名・数量・支払金額の入力から説明文を組み立て、既存のAI見積もりフローにそのまま流す。
   * "商品名(数量・支払金額)"形式にしておくと、過去のまとめ買い履歴から商品名だけを再抽出できる（extractPastBulkItems）。
   * 実際に支払った金額を渡すことで、AIが通常価格との差額から節約額をより正確に見積もれる。 */
  const submitBulk = async () => {
    const valid = bulkItems.filter((it) => it.product.trim());
    if (valid.length === 0 || bulkSubmitting) return;
    const text =
      BULK_PREFIX +
      valid
        .map((it) => {
          const parts = [it.qty.trim(), it.price.trim() ? `支払${it.price.trim()}円` : ""].filter(Boolean);
          return `${it.product.trim()}${parts.length ? `(${parts.join("・")})` : ""}`;
        })
        .join("、");
    setBulkSubmitting(true);
    setBulkMsg("");
    try {
      await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", { description: text });
      setBulkItems([{ product: "", qty: "", price: "" }]);
      load();
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setBulkSubmitting(false);
    }
  };

  /** 「○○を○%オフで○○円で買った」を登録する。節約額はAIに推測させず、サーバー側で
   * 支払額と割引率から確定計算する（絵文字の選定だけAIに任せる）。 */
  const submitDiscount = async () => {
    const item = discountItem.trim();
    const percent = Number(discountPercent);
    const price = Number(discountPrice);
    if (!item || !(percent > 0 && percent < 100) || !(price > 0) || discountSubmitting) return;
    setDiscountSubmitting(true);
    setDiscountMsg("");
    try {
      await apiPost<{ action: SavingsActionOut }>("/api/savings-actions", {
        item,
        discount_percent: percent,
        price_paid: price,
      });
      setDiscountItem("");
      setDiscountPercent("");
      setDiscountPrice("");
      load();
    } catch (e) {
      setDiscountMsg(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setDiscountSubmitting(false);
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

      <div className="mf-formgrid" style={{ marginBottom: 4 }}>
        <input
          className="mf-input"
          placeholder="🔍 検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mf-panel">
        <label className="mf-fieldlabel" htmlFor="sv-desc">
          行動を登録
        </label>
        <textarea
          id="sv-desc"
          className="mf-input"
          rows={3}
          placeholder="節約した行動を書く"
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
        <div
          className="sv-bulktoggle"
          role="button"
          tabIndex={0}
          onClick={() => setBulkExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setBulkExpanded((v) => !v);
          }}
        >
          <span className="mf-fieldlabel" style={{ margin: 0 }}>
            📦 まとめ買いを記録
          </span>
          <span className="sv-chevron">{bulkExpanded ? "︿" : "﹀"}</span>
        </div>
        {bulkExpanded && (
          <div style={{ marginTop: 10 }}>
            {pastBulkItems.length > 0 && (
              <div className="mf-chips" style={{ marginBottom: 10 }}>
                {pastBulkItems.map((name) => (
                  <button key={name} className="mf-chipbtn" style={{ cursor: "pointer" }} onClick={() => pickBulkItem(name)}>
                    {name}
                  </button>
                ))}
              </div>
            )}
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
                  style={{ flex: 1, minWidth: 110 }}
                  placeholder="数量（例: 12ロール）"
                  value={item.qty}
                  onChange={(e) => updateBulkItem(idx, "qty", e.target.value)}
                />
                <input
                  className="mf-input mf-mono"
                  style={{ flex: 1, minWidth: 110 }}
                  type="number"
                  placeholder="支払金額（例: 620）"
                  value={item.price}
                  onChange={(e) => updateBulkItem(idx, "price", e.target.value)}
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
        )}
      </div>

      <div className="mf-panel">
        <div
          className="sv-bulktoggle"
          role="button"
          tabIndex={0}
          onClick={() => setDiscountExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setDiscountExpanded((v) => !v);
          }}
        >
          <span className="mf-fieldlabel" style={{ margin: 0 }}>
            🏷️ 割引購入を記録
          </span>
          <span className="sv-chevron">{discountExpanded ? "︿" : "﹀"}</span>
        </div>
        {discountExpanded && (
          <div className="mf-row" style={{ marginTop: 10 }}>
            <input
              className="mf-input"
              style={{ flex: 2, minWidth: 140 }}
              placeholder="商品名（例: コーヒー豆）"
              value={discountItem}
              onChange={(e) => setDiscountItem(e.target.value)}
            />
            <input
              className="mf-input mf-mono"
              style={{ flex: 1, minWidth: 90 }}
              type="number"
              placeholder="割引率（例: 20）"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />
            <input
              className="mf-input mf-mono"
              style={{ flex: 1, minWidth: 110 }}
              type="number"
              placeholder="支払金額（例: 800）"
              value={discountPrice}
              onChange={(e) => setDiscountPrice(e.target.value)}
            />
            <button
              className="mf-btn primary"
              onClick={submitDiscount}
              disabled={discountSubmitting || !discountItem.trim() || !discountPercent || !discountPrice}
            >
              {discountSubmitting ? "登録中…" : "登録する"}
            </button>
          </div>
        )}
        {discountMsg && <div className="mf-hint">{discountMsg}</div>}
      </div>

      {filtered.length === 0 ? (
        <div className="mf-empty">{actions.length === 0 ? "まだ登録がありません。" : "該当するカードがありません。"}</div>
      ) : (
        <div className="sv-cards">
          {filtered.map((a) => {
            const expanded = expandedIds.has(a.id);
            return (
              <div key={a.id} className={`sv-card${expanded ? " sv-card-expanded" : ""}`}>
                <div
                  className="sv-cardhead"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpanded(a.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toggleExpanded(a.id);
                  }}
                >
                  <span className="sv-cardemoji">{a.emoji || "💡"}</span>
                  <span className="sv-cardtitle">{a.title}</span>
                  <span className="sv-cardamount">{fmt(a.estimated_saving)}</span>
                  <button
                    className="mf-iconbtn sv-cardquick"
                    disabled={repeatingId === a.id}
                    title="今日の行動として追加"
                    aria-label="今日の行動として追加"
                    onClick={(e) => {
                      e.stopPropagation();
                      repeatToday(a.id);
                    }}
                  >
                    {repeatingId === a.id ? "…" : "🔁"}
                  </button>
                  <span className="sv-chevron">{expanded ? "︿" : "﹀"}</span>
                </div>
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
