"use client";

import { useState } from "react";
import { apiPost } from "@/lib/apiClient";

/**
 * 入力中の項目名・メモ等からカテゴリをAIに推測させる汎用ボタン。
 * フォームのどこにでも置ける — 何を分類するかは呼び出し側がtext/optionsで指定する。
 */
export default function AiSuggestButton({ text, options, onSuggest }: { text: string; options?: string[]; onSuggest: (category: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    if (!text.trim()) {
      setErr("先に名前やメモを入力してください。");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await apiPost<{ category: string }>("/api/ai/suggest-category", { text, options });
      onSuggest(res.category);
    } catch {
      setErr("推測に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button type="button" className="mf-btn ghost" style={{ padding: "6px 10px", flex: "0 0 auto" }} disabled={busy} onClick={run} title="AIにカテゴリを推測させる">
        {busy ? "推測中…" : "✦ AI推測"}
      </button>
      {err && (
        <span style={{ color: "#F26D5F", fontSize: 11 }}>{err}</span>
      )}
    </span>
  );
}
