"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import type { ItemHistoryOut, ItemHistoryAggregatesOut, PeriodTotalsOut } from "@/lib/apiTypes";
import { SectionHead, MoneyViewToggle } from "../common";
import { useDashboard } from "../DashboardContext";

function fmtDateShort(d: string): string {
  return d.slice(5).replace("-", "/");
}

interface DayGroup {
  date: string;
  matchedNames: string[];
}

const TABS: { id: "purchase" | "meal"; label: string }[] = [
  { id: "purchase", label: "🧾 購入品" },
  { id: "meal", label: "🍽 食事" },
];

const PERIOD_ROWS: { key: keyof PeriodTotalsOut; label: string }[] = [
  { key: "thisWeek", label: "今週" },
  { key: "thisMonth", label: "今月" },
  { key: "past3m", label: "過去3ヶ月" },
  { key: "past6m", label: "過去半年" },
  { key: "pastYear", label: "過去1年" },
  { key: "allTime", label: "オールタイム" },
];

function TotalsCard({ title, totals, sub }: { title: string; totals: PeriodTotalsOut; sub?: string }) {
  return (
    <div style={{ background: "#101418", borderRadius: 10, padding: 10 }}>
      <div className="mf-hint" style={{ margin: 0 }}>
        {title}
      </div>
      {sub && (
        <div className="mf-hint" style={{ margin: "2px 0 0", opacity: 0.6, fontSize: 11 }}>
          {sub}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6, marginTop: 6 }}>
        {PERIOD_ROWS.map((p) => (
          <div key={p.key}>
            <div className="mf-hint" style={{ margin: 0, fontSize: 11 }}>
              {p.label}
            </div>
            <div className="mf-mono" style={{ fontWeight: 700 }}>
              {fmt(totals[p.key])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** レシートの購入品・食事の内容など、裏で記録されている品目履歴を検索する。品目名・店名・カテゴリの
 * いずれでもヒットする。購入品と食事は混ざるとわかりにくいため、上部タブでどちらか一方だけを表示する。
 * 同じ日ごとにまとめて表示し、タップするとその日に登録された全件（金額つき）に展開できる。
 * 購入品タブでは、ヒットの種類（品目名／店名／カテゴリ）に応じて期間別の金額合計も表示する。 */
export default function ItemHistorySearch() {
  const { me, ownerFilter } = useDashboard();
  const meName = me?.profile.name ?? "";
  const [source, setSource] = useState<"purchase" | "meal">("purchase");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemHistoryOut[] | null>(null);
  const [aggregates, setAggregates] = useState<ItemHistoryAggregatesOut | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<ItemHistoryOut[] | null>(null);

  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q: query.trim(), source });
      if (ownerFilter) qs.set("owner", ownerFilter);
      apiGet<{ items: ItemHistoryOut[]; aggregates: ItemHistoryAggregatesOut | null }>(`/api/item-history?${qs.toString()}`)
        .then((r) => {
          setItems(r.items);
          setAggregates(r.aggregates);
        })
        .catch(() => {
          setItems([]);
          setAggregates(null);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query, ownerFilter, source]);

  const groups = useMemo<DayGroup[]>(() => {
    if (!items) return [];
    const byDate = new Map<string, Set<string>>();
    for (const it of items) {
      const set = byDate.get(it.date) ?? new Set<string>();
      set.add(it.name);
      byDate.set(it.date, set);
    }
    return Array.from(byDate.entries())
      .map(([date, names]) => ({ date, matchedNames: Array.from(names) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [items]);

  const toggleDay = (date: string) => {
    if (expandedDate === date) {
      setExpandedDate(null);
      setDayDetail(null);
      return;
    }
    setExpandedDate(date);
    setDayDetail(null);
    const qs = new URLSearchParams({ date, source });
    if (ownerFilter) qs.set("owner", ownerFilter);
    apiGet<{ items: ItemHistoryOut[] }>(`/api/item-history?${qs.toString()}`)
      .then((r) => setDayDetail(r.items))
      .catch(() => setDayDetail([]));
  };

  return (
    <section className="mf-section">
      <SectionHead
        no="27"
        title="履歴検索"
        sub="レシートの購入品・食事の記録などから、品目名・店名・カテゴリで「いつ買った/食べたか」や金額を検索できます。"
      />
      <MoneyViewToggle />
      <div className="mf-panel">
        <div className="mf-chips" style={{ marginTop: 0, marginBottom: 10 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={"mf-chipbtn" + (source === t.id ? " on" : "")}
              onClick={() => {
                setSource(t.id);
                setItems(null);
                setAggregates(null);
                setExpandedDate(null);
                setDayDetail(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="mf-input"
          placeholder={source === "purchase" ? "🔍 品目名・店名・カテゴリで検索（例: 洗剤、セブン、食費）" : "🔍 食事を検索（例: カレー）"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!query.trim() ? (
          <div className="mf-empty" style={{ marginTop: 10 }}>
            検索キーワードを入力してください。
          </div>
        ) : items === null ? (
          <div className="mf-empty" style={{ marginTop: 10 }}>
            検索中…
          </div>
        ) : groups.length === 0 ? (
          <div className="mf-empty" style={{ marginTop: 10 }}>
            見つかりませんでした。
          </div>
        ) : (
          <>
            {aggregates && (aggregates.byItem || aggregates.byStore || aggregates.byCategory) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {aggregates.byItem && (
                  <TotalsCard
                    title={`「${aggregates.byItem.query}」の使用金額`}
                    totals={aggregates.byItem.totals}
                    sub={aggregates.byItem.unknownCount > 0 ? `金額が読み取れていない記録が${aggregates.byItem.unknownCount}件あります（合計には含まれません）` : undefined}
                  />
                )}
                {aggregates.byStore && <TotalsCard title={`「${aggregates.byStore.query}」を含む店舗での使用金額`} totals={aggregates.byStore.totals} />}
                {aggregates.byCategory && (
                  <TotalsCard title={`「${aggregates.byCategory.query}」カテゴリの使用金額`} totals={aggregates.byCategory.totals} />
                )}
              </div>
            )}

            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {groups.map((g) => (
                <div key={g.date} className="mf-panel" style={{ margin: 0, background: "#101418" }}>
                  <button
                    onClick={() => toggleDay(g.date)}
                    style={{ width: "100%", background: "none", border: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", padding: 0 }}
                  >
                    <div className="mf-row" style={{ justifyContent: "space-between" }}>
                      <b>{fmtDateShort(g.date)}</b>
                      <span className="mf-hint" style={{ margin: 0 }}>{expandedDate === g.date ? "▾ 閉じる" : "▸ 展開"}</span>
                    </div>
                    <div className="mf-hint" style={{ margin: "4px 0 0" }}>
                      {g.matchedNames.join("、")}
                    </div>
                  </button>
                  {expandedDate === g.date && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      {dayDetail === null ? (
                        <div className="mf-hint" style={{ margin: 0 }}>読み込み中…</div>
                      ) : dayDetail.length === 0 ? (
                        <div className="mf-hint" style={{ margin: 0 }}>記録が見つかりませんでした。</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {dayDetail.map((e) => (
                            <div key={e.id} className="mf-row" style={{ justifyContent: "space-between", gap: 8 }}>
                              <span style={{ flex: 1 }}>
                                {e.name}
                                {e.store && <span className="mf-hint" style={{ margin: "0 0 0 6px", opacity: 0.6 }}>{e.store}</span>}
                                {e.owner_name !== meName && (
                                  <span className="mf-ownerchip" style={{ marginLeft: 6 }}>
                                    {e.owner_name}
                                  </span>
                                )}
                              </span>
                              <b className="mf-mono">{e.amount !== null ? fmt(e.amount) : "—"}</b>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
