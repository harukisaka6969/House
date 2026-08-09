"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, ApiClientError } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import type { YearTimelineOut, TimelineItemOut } from "@/lib/apiTypes";
import { SectionHead } from "../common";

const DOT_COLOR: Record<TimelineItemOut["kind"], string> = {
  anniversary: "#F26D5F",
  expense: "#8B7CF6",
  diary: "#45C48F",
};

function iconFor(item: TimelineItemOut): string {
  if (item.kind === "anniversary") {
    if (item.title.includes("誕生日")) return "🎂";
    if (item.title.includes("結婚") || item.title.includes("プロポーズ")) return "💍";
    return "🎉";
  }
  if (item.kind === "expense") return item.description === "旅行" ? "✈️" : "💴";
  return "📖";
}

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type Column = { kind: "item"; item: TimelineItemOut; key: string } | { kind: "today" };

/** 表示中の年が今年なら、日付順の並びの中に「今日」の目印を差し込む位置を決める。 */
function buildColumns(items: TimelineItemOut[], year: number): Column[] {
  const columns: Column[] = [];
  const isCurrentYear = year === Number(todayStr().slice(0, 4));
  let todayInserted = !isCurrentYear;
  items.forEach((item, i) => {
    if (!todayInserted && item.date > todayStr()) {
      columns.push({ kind: "today" });
      todayInserted = true;
    }
    columns.push({ kind: "item", item, key: `${item.date}-${item.kind}-${i}` });
  });
  if (!todayInserted) columns.push({ kind: "today" });
  return columns;
}

export default function YearTimeline() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<YearTimelineOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const todayRef = useRef<HTMLDivElement>(null);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const load = (y: number) => {
    apiGet<YearTimelineOut>(`/api/year-timeline?year=${y}`)
      .then(setData)
      .catch(() => setData({ items: [], highlightsGeneratedAt: null }));
  };
  useEffect(() => load(year), [year]);

  useEffect(() => {
    if (data && data.items.length > 0) {
      todayRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [data]);

  const generate = async () => {
    setBusy(true);
    setMsg("");
    try {
      await apiPost("/api/year-timeline/generate", { year });
      load(year);
      setMsg("✓ タイムラインを整理しました。");
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : "抽出に失敗しました。");
    }
    setBusy(false);
  };

  const columns = data ? buildColumns(data.items, year) : [];

  return (
    <section className="mf-section">
      <SectionHead no="24" title="タイムライン" sub="その年に起きた大きな出来事を、記念日・注目の支出・日記から振り返ります。右へ進むほど時期が進みます。" />

      <div className="mf-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="mf-row" style={{ gap: 10 }}>
          <button className="mf-btn ghost" onClick={() => setYear((y) => y - 1)}>
            ‹
          </button>
          <span className="mf-title" style={{ fontSize: 22, margin: 0 }}>
            {year}年
          </span>
          <button className="mf-btn ghost" onClick={() => setYear((y) => y + 1)}>
            ›
          </button>
        </div>
        <button className="mf-btn ghost" disabled={busy} onClick={generate}>
          {busy ? "整理中…" : data?.highlightsGeneratedAt ? "🪄 タイムラインを整理し直す" : "🪄 AIでタイムラインを整理する"}
        </button>
      </div>
      {data?.highlightsGeneratedAt && (
        <div className="mf-hint" style={{ opacity: 0.7 }}>
          最終整理: {new Date(data.highlightsGeneratedAt).toLocaleString("ja-JP")}（支出のまとめ方の見出しと、日記のハイライト（自分の分のみ・相手には非表示）を更新します）
        </div>
      )}
      {msg && <div className="mf-hint">{msg}</div>}

      <div className="mf-panel">
        {!data ? (
          <div className="mf-empty">読み込み中…</div>
        ) : data.items.length === 0 ? (
          <div className="mf-empty">
            {year}年にはまだ何も記録がありません。記念日を登録するか、日記を書いてハイライトを抽出してみてください。
          </div>
        ) : (
          <div className="yr-hscroll">
            <div className="yr-htrack">
              {columns.map((col, ci) => {
                if (col.kind === "today") {
                  return (
                    <div key="today" ref={todayRef} className="yr-htoday">
                      <span className="yr-htodaylabel">今日</span>
                      <span className="yr-htodaydot" />
                    </div>
                  );
                }
                const { item, key } = col;
                const prevItem = columns[ci - 1];
                const prevMonth =
                  prevItem?.kind === "item" ? Number(prevItem.item.date.slice(5, 7)) - 1 : ci === 0 ? -1 : Number(item.date.slice(5, 7)) - 1;
                const month = Number(item.date.slice(5, 7)) - 1;
                const showMonth = month !== prevMonth;
                const hasChildren = (item.children?.length ?? 0) > 1;
                const isOpen = expanded.has(key);
                return (
                  <div key={key} className="yr-hcol" style={hasChildren && isOpen ? { width: 240 } : undefined}>
                    {showMonth && <div className="yr-hmonth">{MONTH_LABELS[month] ?? ""}</div>}
                    <div className="yr-hdot" style={{ borderColor: DOT_COLOR[item.kind] }}>
                      {iconFor(item)}
                    </div>
                    <div className="yr-hcard" style={hasChildren ? { cursor: "pointer" } : undefined} onClick={hasChildren ? () => toggleExpand(key) : undefined}>
                      <div className="yr-hdate">{item.date.slice(5)}</div>
                      <div className="yr-htitle">{item.title}</div>
                      {item.amount !== undefined && <div className="yr-hamount">{fmt(item.amount)}</div>}
                      {hasChildren && <div className="yr-hcount">{isOpen ? "▾" : "▸"} 内訳 {item.children!.length}件</div>}
                      {hasChildren && isOpen && (
                        <div className="yr-hchildren">
                          {item.children!.map((c, cci) => (
                            <div key={cci} className="yr-hchild">
                              <span className="yr-hchilddate">{c.date.slice(5)}</span>
                              <span className="yr-hchildtitle" title={c.title}>{c.title}</span>
                              <span className="yr-hchildamount">{fmt(c.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
