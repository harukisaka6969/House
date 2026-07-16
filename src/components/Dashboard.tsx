"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { apiGet, apiPost } from "@/lib/apiClient";
import { shiftMonth } from "@/lib/date";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import AgentWidget from "./AgentWidget";
import Summary from "./sections/Summary";
import Flow from "./sections/Flow";
import Accounts from "./sections/Accounts";
import ExpensePanel from "./sections/ExpensePanel";
import Invest from "./sections/Invest";
import Sim from "./sections/SimPanel";
import Settings from "./sections/Settings";
import { SectionHead } from "./common";

const MENU: [string, string][] = [
  ["summary", "① サマリー"],
  ["flow", "② お金の流れ"],
  ["accounts", "③ 口座・判定"],
  ["expenses", "④ 支出明細"],
  ["invest", "⑤ 投資"],
  ["sim", "⑥ シミュレーション"],
  ["settings", "⑦ 設定"],
];

export default function Dashboard({ slug }: { slug: string }) {
  return (
    <DashboardProvider slug={slug}>
      <DashboardInner />
    </DashboardProvider>
  );
}

function PasskeyBanner() {
  const { me, refreshMe } = useDashboard();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!me || me.devices.length > 0 || dismissed || !browserSupportsWebAuthn()) return null;

  const register = async () => {
    setBusy(true);
    setErr("");
    try {
      const options = await apiGet<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/auth/webauthn/register-options");
      const response = await startRegistration({ optionsJSON: options });
      const deviceName = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 40) : "このデバイス";
      await apiPost("/api/auth/webauthn/register-verify", { response, deviceName });
      refreshMe();
      setDismissed(true);
    } catch {
      setErr("登録に失敗しました。設定画面から再度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mf-pinbar" style={{ background: "#181E25", border: "1px solid rgba(245,165,36,0.3)", borderRadius: 10, padding: "10px 14px" }}>
      <span>このiPhoneのFace IDを登録しますか？次回からワンタップで解錠できます。</span>
      <button className="mf-btn primary" disabled={busy} onClick={register}>
        {busy ? "登録中…" : "登録する"}
      </button>
      <button className="mf-btn ghost" onClick={() => setDismissed(true)}>
        あとで
      </button>
      {err && <span style={{ color: "#F26D5F", fontSize: 12 }}>{err}</span>}
    </div>
  );
}

function DashboardInner() {
  const router = useRouter();
  const { slug, me, monthKey, setMonthKey, loading } = useDashboard();
  const [view, setView] = useState<string>("summary");
  const [menuOpen, setMenuOpen] = useState(false);

  const logout = async () => {
    await apiPost("/api/auth/logout");
    router.push(`/${slug}`);
  };

  return (
    <div className="mf-root">
      <header className="mf-header">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <div className="mf-menuwrap">
            <button className="mf-menubtn" aria-haspopup="true" aria-expanded={menuOpen} aria-label="メニュー" onClick={() => setMenuOpen((o) => !o)}>
              ☰
            </button>
            <div className={"mf-drawer" + (menuOpen ? " open" : "")}>
              {MENU.map(([id, label]) => (
                <button key={id} className={"mf-drawitem" + (view === id ? " active" : "")} onClick={() => { setView(id); setMenuOpen(false); }}>
                  {label}
                </button>
              ))}
              <div className="mf-drawsep" />
              <button className="mf-drawitem" onClick={() => router.push(`/${slug}/quick`)}>
                ⚡ クイック入力
              </button>
              <button className="mf-drawitem" onClick={logout}>
                ログアウト
              </button>
            </div>
          </div>
          <div>
            <div className="mf-eyebrow">SAKA HOUSEHOLD LEDGER</div>
            <h1 className="mf-title">家計フローダッシュボード</h1>
          </div>
        </div>
        <div className="mf-headright">
          <a className="mf-btn quick" href={`/${slug}/quick`}>
            ⚡ 入力
          </a>
          <span className="mf-numsub">
            {me?.profile.name}
            {me?.partner ? ` ／ ${me.partner.name}` : ""}
          </span>
          <div className="mf-monthnav">
            <button className="mf-iconbtn" onClick={() => setMonthKey(shiftMonth(monthKey, -1))} aria-label="前の月">
              ‹
            </button>
            <span className="mf-monthlabel">{monthKey.replace("-", "年")}月</span>
            <button className="mf-iconbtn" onClick={() => setMonthKey(shiftMonth(monthKey, 1))} aria-label="次の月">
              ›
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px" }}>
        <PasskeyBanner />
      </div>

      <main className="mf-main">
        {loading && !me ? (
          <div className="mf-empty" style={{ padding: 40, textAlign: "center" }}>
            読み込み中…
          </div>
        ) : (
          <>
            {view === "summary" && <Summary />}
            {view === "flow" && <Flow />}
            {view === "accounts" && <Accounts />}
            {view === "expenses" && (
              <section className="mf-section">
                <SectionHead no="04" title="支出明細" sub={`いちばん細かい視点。${me?.profile.name ?? ""}として入力します。文章・レシート写真・手入力に対応。`} />
                <ExpensePanel />
              </section>
            )}
            {view === "invest" && <Invest />}
            {view === "sim" && <Sim />}
            {view === "settings" && <Settings />}
          </>
        )}
        <footer className="mf-footer">データはこのアプリのサーバーに保存されます。投資に関する情報は参考情報であり、投資判断はご自身の責任で。</footer>
      </main>
      <AgentWidget />
    </div>
  );
}
