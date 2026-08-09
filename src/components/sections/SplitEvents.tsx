"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, ApiClientError } from "@/lib/apiClient";
import type { SplitEventOut } from "@/lib/apiTypes";
import { SectionHead } from "../common";

function shareUrl(token: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/split/${token}`;
}

export default function SplitEvents() {
  const [events, setEvents] = useState<SplitEventOut[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = () => {
    apiGet<{ events: SplitEventOut[] }>("/api/split-events")
      .then((r) => setEvents(r.events))
      .catch(() => setEvents([]));
  };
  useEffect(load, []);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setMsg("");
    try {
      await apiPost("/api/split-events", { name: name.trim() });
      setName("");
      load();
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : "作成に失敗しました。");
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    await apiDelete(`/api/split-events/${id}`);
    load();
  };

  const copyLink = async (event: SplitEventOut) => {
    try {
      await navigator.clipboard.writeText(shareUrl(event.share_token));
      setCopiedId(event.id);
      setTimeout(() => setCopiedId((c) => (c === event.id ? null : c)), 2000);
    } catch {
      setMsg("コピーに失敗しました。リンクを長押しでコピーしてください。");
    }
  };

  if (!events) return <div className="mf-empty">読み込み中…</div>;

  return (
    <section className="mf-section">
      <SectionHead
        no="22"
        title="割り勘"
        sub="旅行などのイベントを作ってリンクを共有すると、アリサ・ハルキ以外の同行者もそのリンクから支出を登録できます。誰が誰のために支払ったかを記録すると、自動で割り勘の精算方法を計算します。"
      />

      <div className="mf-panel">
        <div className="mf-paneltitle">新しいイベントを作る</div>
        <div className="mf-row" style={{ marginTop: 6 }}>
          <input
            className="mf-input"
            style={{ flex: 1 }}
            placeholder="例: 軽井沢旅行"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button className="mf-btn primary" disabled={busy || !name.trim()} onClick={create}>
            作成する
          </button>
        </div>
        {msg && <div className="mf-hint">{msg}</div>}
      </div>

      {events.length === 0 ? (
        <div className="mf-empty" style={{ marginTop: 12 }}>
          まだイベントがありません。上のフォームから作成してください。
        </div>
      ) : (
        <div className="mf-panel">
          <div className="mf-list" style={{ maxHeight: "none" }}>
            {events.map((ev) => (
              <div key={ev.id} className="mf-shopitem">
                <div className="mf-row" style={{ justifyContent: "space-between" }}>
                  <span className="mf-shopname">{ev.name}</span>
                  <button className="mf-del" onClick={() => remove(ev.id)}>
                    ×
                  </button>
                </div>
                <div className="mf-row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <a className="mf-btn ghost" style={{ padding: "4px 10px", fontSize: 12 }} href={`/split/${ev.share_token}`} target="_blank" rel="noreferrer">
                    開く
                  </a>
                  <button className="mf-btn ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => copyLink(ev)}>
                    {copiedId === ev.id ? "✓ コピーしました" : "🔗 共有リンクをコピー"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mf-hint" style={{ opacity: 0.7 }}>
            このリンクを知っている人は誰でも、そのイベントに参加者・支出を追加できます。信頼できる同行者にだけ共有してください。
          </div>
        </div>
      )}
    </section>
  );
}
