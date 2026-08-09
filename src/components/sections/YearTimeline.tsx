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
      setMsg("✓ 日記からハイライトを抽出しました。");
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
          {busy ? "抽出中…" : data?.highlightsGeneratedAt ? "🪄 日記から再抽出する" : "🪄 日記からハイライトを抽出する"}
        </button>
      </div>
      {data?.highlightsGeneratedAt && (
        <div className="mf-hint" style={{ opacity: 0.7 }}>
          最終抽出: {new Date(data.highlightsGeneratedAt).toLocaleString("ja-JP")}（自分の日記からのみ。相手には表示されません）
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
              return (
                <div key={`${item.date}-${item.kind}-${i}`}>
                  {showMonth && <div className="yr-tlmonth">{MONTH_LABELS[month] ?? ""}</div>}
                  <div className="yr-tlnode">
                    <div className="yr-tldot" style={{ borderColor: DOT_COLOR[item.kind] }}>
                      {iconFor(item)}
                    </div>
                    <div className="yr-tlcard">
                      <div className="yr-tldate">{item.date}</div>
                      <div className="yr-tltitle">{item.title}</div>
                      {item.description && item.kind !== "expense" && <div className="yr-tldesc">{item.description}</div>}
                      {item.amount !== undefined && <div className="yr-tlamount">{fmt(item.amount)}</div>}
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
