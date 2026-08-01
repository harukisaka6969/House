"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import type { DigestOut, DigestsResponse } from "@/lib/apiTypes";

type Tab = "daily" | "weekly";

function formatPeriod(d: DigestOut, tab: Tab): string {
  if (tab === "daily") return `${d.period_key} のまとめ`;
  const [y, m, day] = d.period_key.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1, day + 6));
  const endStr = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;
  return `${d.period_key} 〜 ${endStr} のダイジェスト`;
}

/** ダッシュボード最上部に出す、AIによる前日のまとめ・週間ダイジェスト。本人にしか表示しない前提のデータ（日記等）を含むため、必ずログイン中の本人視点で取得する。 */
export default function DigestBanner() {
  const [data, setData] = useState<DigestsResponse | null>(null);
  const [tab, setTab] = useState<Tab>("daily");
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    apiGet<DigestsResponse>("/api/digests")
      .then(setData)
      .catch(() => setData({ daily: null, weekly: null }));
  };
  useEffect(load, []);

  const regenerate = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await apiPost<{ digest: DigestOut }>("/api/digests", { kind: tab });
      setData((prev) => ({ ...(prev ?? { daily: null, weekly: null }), [tab]: r.digest }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "生成に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;

  const current = data[tab];

  return (
    <div className="mf-panel">
      <div className="mf-row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: collapsed ? 0 : 10 }}>
        <div className="mf-paneltitle" style={{ margin: 0 }}>
          📰 ダイジェスト
        </div>
        <button className="mf-btn ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? "開く" : "閉じる"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="mf-chips" style={{ marginBottom: 10 }}>
            <button className={"mf-chipbtn" + (tab === "daily" ? " on" : "")} onClick={() => setTab("daily")}>
              前日のまとめ
            </button>
            <button className={"mf-chipbtn" + (tab === "weekly" ? " on" : "")} onClick={() => setTab("weekly")}>
              週間ダイジェスト
            </button>
          </div>

          {current ? (
            <>
              <div className="mf-hint" style={{ marginTop: 0, opacity: 0.7 }}>
                {formatPeriod(current, tab)}
              </div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75, fontSize: 14, marginTop: 6 }}>{current.body}</div>
            </>
          ) : (
            <div className="mf-empty">
              {tab === "daily" ? "前日のまとめはまだありません。" : "週間ダイジェストはまだありません（毎週月曜日に自動生成されます）。"}
            </div>
          )}

          <div className="mf-row" style={{ marginTop: 10 }}>
            <button className="mf-btn ghost" disabled={busy} onClick={regenerate}>
              {busy ? "生成中…" : current ? "作り直す" : "今すぐ生成する"}
            </button>
          </div>
          {err && <div className="mf-hint">{err}</div>}
        </>
      )}
    </div>
  );
}
