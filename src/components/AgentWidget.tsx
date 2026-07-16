"use client";

import { useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/apiClient";
import { useDashboard } from "./DashboardContext";

const AGENT_SUGGESTIONS = ["今月の使いすぎポイントは？", "貯蓄率を上げるには？", "先月と比べてどう？"];

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export default function AgentWidget() {
  const { monthKey, me, agentOpen, setAgentOpen, advisorExtraContext, clearAdvisorExtraContext } = useDashboard();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy, agentOpen]);

  const send = async (preset?: string) => {
    const t = (preset ?? input).trim();
    if (!t || busy) return;
    const newMsgs: ChatMsg[] = [...msgs, { role: "user", content: t }];
    setMsgs(newMsgs);
    setInput("");
    setBusy(true);
    try {
      const resp = await apiPost<{ reply: string }>("/api/ai/advisor", {
        messages: newMsgs,
        month: monthKey,
        extraContext: advisorExtraContext ?? undefined,
      });
      setMsgs([...newMsgs, { role: "assistant", content: resp.reply }]);
      clearAdvisorExtraContext();
    } catch {
      setMsgs([...newMsgs, { role: "assistant", content: "エラーが発生しました。もう一度試してください。" }]);
    }
    setBusy(false);
  };

  const meName = me?.profile.name ?? "";

  return (
    <>
      <button className="mf-fab" aria-label="AIアドバイザーを開く" onClick={() => setAgentOpen(!agentOpen)}>
        {agentOpen ? "×" : "✦"}
      </button>
      {agentOpen && (
        <div className="mf-agent" role="dialog" aria-label="AIアドバイザー">
          <div className="mf-agenthead">
            <span>
              <span style={{ color: "#F5A524" }}>✦</span> 家計アドバイザー
            </span>
            <span className="mf-row" style={{ marginTop: 0, gap: 6 }}>
              {msgs.length > 0 && (
                <button className="mf-del" title="履歴をクリア" onClick={() => setMsgs([])}>
                  クリア
                </button>
              )}
              <button className="mf-del" onClick={() => setAgentOpen(false)}>
                ×
              </button>
            </span>
          </div>
          <div className="mf-agentbody" ref={bodyRef}>
            {msgs.length === 0 && (
              <div className="mf-agentintro">
                <div style={{ marginBottom: 8 }}>
                  {meName}さん、{advisorExtraContext ? "分析出力のデータをもとに" : "今月のデータを見ながら"}分析やアドバイスができます。
                </div>
                {advisorExtraContext ? (
                  <button className="mf-chipbtn" style={{ marginBottom: 6, width: "100%" }} onClick={() => send("このデータについて分析してください。")}>
                    このデータについて分析してください
                  </button>
                ) : (
                  AGENT_SUGGESTIONS.map((s) => (
                    <button key={s} className="mf-chipbtn" style={{ marginBottom: 6, width: "100%" }} onClick={() => send(s)}>
                      {s}
                    </button>
                  ))
                )}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={"mf-abub " + (m.role === "user" ? "user" : "ai")}>
                {m.content}
              </div>
            ))}
            {busy && <div className="mf-abub ai" style={{ opacity: 0.6 }}>考え中…</div>}
          </div>
          <div className="mf-agentfoot">
            <input
              className="mf-input"
              style={{ flex: 1 }}
              placeholder="質問を入力…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <button className="mf-btn primary" disabled={busy || !input.trim()} onClick={() => send()}>
              送信
            </button>
          </div>
          <div className="mf-agentnote">参考情報です。投資・重要な判断はご自身で。相手の第3口座の明細はAIにも渡していません。</div>
        </div>
      )}
    </>
  );
}
