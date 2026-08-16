"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { ItemHistoryOut } from "@/lib/apiTypes";
import { SectionHead, MoneyViewToggle } from "../common";
import { useDashboard } from "../DashboardContext";

function fmtDateShort(d: string): string {
  return d.slice(5).replace("-", "/");
}

interface Group {
  name: string;
  entries: ItemHistoryOut[];
}

const TABS: { id: "purchase" | "meal"; label: string }[] = [
  { id: "purchase", label: "🧾 購入品" },
  { id: "meal", label: "🍽 食事" },
];

/** レシートの購入品・食事の内容など、裏で記録されている品目履歴をキーワード検索する。
 * 購入品と食事は混ざるとわかりにくいため、上部タブでどちらか一方だけを表示する。
 * 同じ品目名ごとにまとめて、いつ登録されたか（日付一覧）を表示する。 */
export default function ItemHistorySearch() {
  const { me, ownerFilter } = useDashboard();
  const meName = me?.profile.name ?? "";
  const [source, setSource] = useState<"purchase" | "meal">("purchase");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemHistoryOut[] | null>(null);

  useEffect(() => {
    if (!query.trim()) return;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q: query.trim(), source });
      if (ownerFilter) qs.set("owner", ownerFilter);
      apiGet<{ items: ItemHistoryOut[] }>(`/api/item-history?${qs.toString()}`)
        .then((r) => setItems(r.items))
        .catch(() => setItems([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query, ownerFilter, source]);

  const groups = useMemo<Group[]>(() => {
    if (!items) return [];
    const byName = new Map<string, ItemHistoryOut[]>();
    for (const it of items) {
      const list = byName.get(it.name) ?? [];
      list.push(it);
      byName.set(it.name, list);
    }
    return Array.from(byName.entries())
      .map(([name, entries]) => ({ name, entries }))
      .sort((a, b) => b.entries.length - a.entries.length || b.entries[0].date.localeCompare(a.entries[0].date));
  }, [items]);

  return (
    <section className="mf-section">
      <SectionHead
        no="27"
        title="履歴検索"
        sub="レシートの購入品・食事の記録などから、品目名で「いつ買った/食べたか」を検索できます（例: 洗剤）。"
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
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="mf-input"
          placeholder={source === "purchase" ? "🔍 購入品を検索（例: 洗剤）" : "🔍 食事を検索（例: カレー）"}
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
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {groups.map((g) => (
              <div key={g.name} className="mf-panel" style={{ margin: 0, background: "#101418" }}>
                <div className="mf-row" style={{ justifyContent: "space-between" }}>
                  <b>{g.name}</b>
                  <span className="mf-hint" style={{ margin: 0, opacity: 0.6 }}>
                    {g.entries.length}回
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {g.entries.map((e) => (
                    <span key={e.id} className="mf-mono" style={{ fontSize: 12, background: "#181E25", borderRadius: 6, padding: "3px 8px" }}>
                      {fmtDateShort(e.date)}
                      {e.owner_name !== meName && (
                        <span className="mf-ownerchip" style={{ marginLeft: 4 }}>
                          {e.owner_name}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
