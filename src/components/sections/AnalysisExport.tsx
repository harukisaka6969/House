"use client";

import { useState } from "react";
import { todayStrJST, nowMonthKeyJST, shiftMonth } from "@/lib/date";
import { useDashboard } from "../DashboardContext";

type Preset = "thisMonth" | "lastMonth" | "3m" | "6m" | "1y" | "all" | "custom";
type Granularity = "raw" | "daily" | "monthly";
type Owner = "me" | "all";

function presetRange(preset: Preset): { from: string; to: string } {
  const today = todayStrJST();
  const curMonth = nowMonthKeyJST();
  switch (preset) {
    case "thisMonth":
      return { from: `${curMonth}-01`, to: today };
    case "lastMonth": {
      const m = shiftMonth(curMonth, -1);
      const [y, mm] = m.split("-").map(Number);
      const lastDay = new Date(y, mm, 0).getDate();
      return { from: `${m}-01`, to: `${m}-${String(lastDay).padStart(2, "0")}` };
    }
    case "3m":
      return { from: `${shiftMonth(curMonth, -2)}-01`, to: today };
    case "6m":
      return { from: `${shiftMonth(curMonth, -5)}-01`, to: today };
    case "1y":
      return { from: `${shiftMonth(curMonth, -11)}-01`, to: today };
    case "all":
      return { from: "2000-01-01", to: today };
    default:
      return { from: `${curMonth}-01`, to: today };
  }
}

const PROMPT_TEMPLATE =
  "以下は家計アプリからエクスポートした支出データ（JSON、meta参照）。このデータに基づいて、支出パターンの分析・無駄の指摘・改善提案をしてください。データにない事柄は推測と明示してください。";

export default function AnalysisExport() {
  const { settings, allCats, openAdvisorWithContext } = useDashboard();
  const accounts = settings?.accounts ?? [];
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [customFrom, setCustomFrom] = useState(todayStrJST());
  const [customTo, setCustomTo] = useState(todayStrJST());
  const [selAccounts, setSelAccounts] = useState<Set<string>>(new Set());
  const [selCategories, setSelCategories] = useState<Set<string>>(new Set());
  const [owner, setOwner] = useState<Owner>("all");
  const [granularity, setGranularity] = useState<Granularity>("raw");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const range = preset === "custom" ? { from: customFrom, to: customTo } : presetRange(preset);

  const buildQuery = (format: "json" | "csv") => {
    const params = new URLSearchParams();
    params.set("from", range.from);
    params.set("to", range.to);
    params.set("owner", owner);
    params.set("granularity", granularity);
    params.set("format", format);
    if (selAccounts.size) params.set("accounts", [...selAccounts].join(","));
    if (selCategories.size) params.set("categories", [...selCategories].join(","));
    return `/api/export/analysis?${params.toString()}`;
  };

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setSet(next);
  };

  const download = async (format: "json" | "csv") => {
    setBusy(format);
    setMsg("");
    try {
      const res = await fetch(buildQuery(format));
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kakeibo-${range.from}_${range.to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMsg("出力に失敗しました。");
    }
    setBusy(null);
  };

  const fetchJson = async (): Promise<string | null> => {
    const res = await fetch(buildQuery("json"));
    if (!res.ok) return null;
    return res.text();
  };

  const copyForClaude = async () => {
    setBusy("copy");
    setMsg("");
    try {
      const json = await fetchJson();
      if (!json) throw new Error("failed");
      await navigator.clipboard.writeText(`${PROMPT_TEMPLATE}\n\n${json}`);
      setMsg("✓ クリップボードにコピーしました。Claudeに貼り付けてください。");
    } catch {
      setMsg("コピーに失敗しました。");
    }
    setBusy(null);
  };

  const askAdvisor = async () => {
    setBusy("advisor");
    setMsg("");
    try {
      const json = await fetchJson();
      if (!json) throw new Error("failed");
      openAdvisorWithContext(json);
      setMsg("✓ アドバイザーにこの期間のデータを渡しました。右下のチャットを開いてください。");
    } catch {
      setMsg("データの取得に失敗しました。");
    }
    setBusy(null);
  };

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">📊 分析出力</div>
      <div className="mf-hint" style={{ marginTop: 0, opacity: 0.75 }}>
        指定した期間・条件の家計データをそのままClaudeに渡せる形式で出力します。
      </div>

      <div className="mf-quicklabel">期間</div>
      <div className="mf-chips">
        {(
          [
            ["thisMonth", "今月"],
            ["lastMonth", "先月"],
            ["3m", "直近3ヶ月"],
            ["6m", "半年"],
            ["1y", "1年"],
            ["all", "全期間"],
            ["custom", "カスタム"],
          ] as [Preset, string][]
        ).map(([id, label]) => (
          <button key={id} className={"mf-chipbtn" + (preset === id ? " on" : "")} onClick={() => setPreset(id)}>
            {label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="mf-row">
          <input className="mf-input" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <span className="mf-numsub">〜</span>
          <input className="mf-input" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
      <div className="mf-hint" style={{ opacity: 0.6 }}>
        {range.from} 〜 {range.to}
      </div>

      <div className="mf-quicklabel">口座（未選択で全口座）</div>
      <div className="mf-chips">
        {accounts.map((a) => (
          <button key={a.id} className={"mf-chipbtn" + (selAccounts.has(a.id) ? " on" : "")} onClick={() => toggle(selAccounts, setSelAccounts, a.id)}>
            <span className="mf-dot" style={{ background: a.color }} />
            {a.name.replace(/（.*）/, "")}
          </button>
        ))}
      </div>

      <div className="mf-quicklabel">カテゴリ（未選択で全カテゴリ）</div>
      <div className="mf-chips">
        {allCats.map((c) => (
          <button key={c} className={"mf-chipbtn" + (selCategories.has(c) ? " on" : "")} onClick={() => toggle(selCategories, setSelCategories, c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="mf-quicklabel">対象</div>
      <div className="mf-chips">
        <button className={"mf-chipbtn" + (owner === "all" ? " on" : "")} onClick={() => setOwner("all")}>
          世帯全体
        </button>
        <button className={"mf-chipbtn" + (owner === "me" ? " on" : "")} onClick={() => setOwner("me")}>
          自分のみ
        </button>
      </div>

      <div className="mf-quicklabel">粒度</div>
      <div className="mf-chips">
        <button className={"mf-chipbtn" + (granularity === "raw" ? " on" : "")} onClick={() => setGranularity("raw")}>
          明細込み
        </button>
        <button className={"mf-chipbtn" + (granularity === "daily" ? " on" : "")} onClick={() => setGranularity("daily")}>
          日別集計
        </button>
        <button className={"mf-chipbtn" + (granularity === "monthly" ? " on" : "")} onClick={() => setGranularity("monthly")}>
          月別集計
        </button>
      </div>

      <div className="mf-row" style={{ marginTop: 14 }}>
        <button className="mf-btn primary" disabled={busy !== null} onClick={copyForClaude}>
          {busy === "copy" ? "コピー中…" : "📋 Claude用にコピー"}
        </button>
        <button className="mf-btn ghost" disabled={busy !== null} onClick={() => download("json")}>
          {busy === "json" ? "処理中…" : "⬇ JSONダウンロード"}
        </button>
        <button className="mf-btn ghost" disabled={busy !== null} onClick={() => download("csv")}>
          {busy === "csv" ? "処理中…" : "⬇ CSVダウンロード"}
        </button>
        <button className="mf-btn ghost" disabled={busy !== null} onClick={askAdvisor}>
          {busy === "advisor" ? "処理中…" : "✦ このデータでアドバイザーに聞く"}
        </button>
      </div>
      {msg && <div className="mf-hint">{msg}</div>}
      <div className="mf-hint" style={{ opacity: 0.65 }}>
        第3口座の相手の明細は、どの出力形式・粒度でも金額・日付・メモを含みません。
      </div>
    </div>
  );
}
