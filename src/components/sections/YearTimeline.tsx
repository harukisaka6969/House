"use client";

import { useEffect, useState } from "react";
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

export default function YearTimeline() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<YearTimelineOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  return (
    <section className="mf-section">
      <SectionHead no="24" title="タイムライン" sub="その年に起きた大きな出来事を、記念日・注目の支出・日記から振り返ります。" />

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
          <div className="yr-timeline">
            {data.items.map((item, i) => {
              const month = Number(item.date.slice(5, 7)) - 1;
              const prevMonth = i > 0 ? Number(data.items[i - 1].date.slice(5, 7)) - 1 : -1;
              const showMonth = month !== prevMonth;
              const key = `${item.date}-${item.kind}-${i}`;
              const hasChildren = (item.children?.length ?? 0) > 1;
              const isOpen = expanded.has(key);
              return (
                <div key={key}>
                  {showMonth && <div className="yr-tlmonth">{MONTH_LABELS[month] ?? ""}</div>}
                  <div className="yr-tlnode">
                    <div className="yr-tldot" style={{ borderColor: DOT_COLOR[item.kind] }}>
                      {iconFor(item)}
                    </div>
                    <div
                      className="yr-tlcard"
                      style={hasChildren ? { cursor: "pointer" } : undefined}
                      onClick={hasChildren ? () => toggleExpand(key) : undefined}
                    >
                      <div className="yr-tldate">{item.date}</div>
                      <div className="yr-tltitle">
                        {item.title}
                        {hasChildren && <span className="yr-tlcount"> {isOpen ? "▾" : "▸"} 内訳 {item.children!.length}件</span>}
                      </div>
                      {item.description && item.kind !== "expense" && <div className="yr-tldesc">{item.description}</div>}
                      {item.amount !== undefined && <div className="yr-tlamount">{fmt(item.amount)}</div>}
                      {hasChildren && isOpen && (
                        <div className="yr-tlchildren">
                          {item.children!.map((c, ci) => (
                            <div key={ci} className="yr-tlchild">
                              <span className="yr-tlchilddate">{c.date.slice(5)}</span>
                              <span className="yr-tlchildtitle">{c.title}</span>
                              <span className="yr-tlchildamount">{fmt(c.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
