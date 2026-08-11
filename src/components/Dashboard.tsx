"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { apiGet, apiPost } from "@/lib/apiClient";
import { shiftMonth } from "@/lib/date";
import type { MeResponse } from "@/lib/apiTypes";
import { DashboardProvider, useDashboard } from "./DashboardContext";
import AppBadgeSync from "./AppBadgeSync";
import { SectionHead } from "./common";

// 各セクションは実際に開いたときだけ読み込む（初回起動時のJSバンドルを最小限にするため）。
const SECTION_LOADING = (
  <div className="mf-empty" style={{ padding: 40, textAlign: "center" }}>
    読み込み中…
  </div>
);
const dyn = <P extends object>(loader: () => Promise<{ default: React.ComponentType<P> }>) =>
  dynamic(loader, { loading: () => SECTION_LOADING });

const FamilyDashboard = dyn<{ slug: string }>(() => import("./FamilyDashboard"));
const KioskDashboard = dyn<{ slug: string }>(() => import("./KioskDashboard"));
const AgentWidget = dynamic(() => import("./AgentWidget"), { ssr: false });
const Home = dyn(() => import("./sections/Home"));
const Summary = dyn(() => import("./sections/Summary"));
const Flow = dyn(() => import("./sections/Flow"));
const Accounts = dyn(() => import("./sections/Accounts"));
const ExpensePanel = dyn(() => import("./sections/ExpensePanel"));
const Invest = dyn(() => import("./sections/Invest"));
const Sim = dyn(() => import("./sections/SimPanel"));
const Wishlist = dyn(() => import("./sections/Wishlist"));
const LifeEvents = dyn(() => import("./sections/LifeEvents"));
const Maintenance = dyn(() => import("./sections/Maintenance"));
const Inventory = dyn(() => import("./sections/Inventory"));
const Journal = dyn(() => import("./sections/Journal"));
const FlowAnalysis = dyn(() => import("./sections/FlowAnalysis"));
const GymLog = dyn(() => import("./sections/GymLog"));
const MealLog = dyn(() => import("./sections/MealLog"));
const ShoppingList = dyn(() => import("./sections/ShoppingList"));
const IdeaBoard = dyn(() => import("./sections/IdeaBoard"));
const Records = dyn(() => import("./sections/Records"));
const Reminders = dyn(() => import("./sections/Reminders"));
const SmartHome = dyn(() => import("./sections/SmartHome"));
const SplitEvents = dyn(() => import("./sections/SplitEvents"));
const Anniversaries = dyn(() => import("./sections/Anniversaries"));
const YearTimeline = dyn(() => import("./sections/YearTimeline"));
const Settings = dyn(() => import("./sections/Settings"));

const MENU_GROUPS: { label: string; items: [string, string][] }[] = [
  {
    label: "🏡 ホーム",
    items: [["home", "⑲ ホーム"]],
  },
  {
    label: "💰 お金",
    items: [
      ["summary", "① サマリー"],
      ["flow", "② お金の流れ"],
      ["accounts", "③ 口座・判定"],
      ["expenses", "④ 支出明細"],
      ["invest", "⑤ 投資"],
      ["sim", "⑥ シミュレーション"],
      ["wishlist", "⑧ 買いたいもの"],
      ["lifeEvents", "⑨ 将来設計"],
      ["flowAnalysis", "⑬ 資産フロー分析"],
      ["splitEvents", "㉒ 割り勘"],
    ],
  },
  {
    label: "🏃 健康",
    items: [
      ["journal", "⑫ 日記"],
      ["ideaBoard", "⑰ アイデアボード"],
      ["gymLog", "⑭ 筋トレログ"],
      ["mealLog", "⑮ 食事ログ"],
      ["records", "⑱ 記録"],
    ],
  },
  {
    label: "🏠 くらし",
    items: [
      ["maintenance", "⑩ メンテナンス"],
      ["inventory", "⑪ 在庫管理"],
      ["shoppingList", "⑯ 買い物リスト"],
      ["reminders", "⑳ リマインダー"],
      ["smartHome", "㉑ 家電"],
    ],
  },
  {
    label: "❤️ ふたり",
    items: [
      ["anniversaries", "㉓ 記念日"],
      ["yearTimeline", "㉔ タイムライン"],
    ],
  },
  {
    label: "⚙️ 設定",
    items: [["settings", "⑦ 設定"]],
  },
];

export default function Dashboard({ slug }: { slug: string }) {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    apiGet<MeResponse>("/api/auth/me").then(setMe).catch(() => {});
  }, []);

  if (me === null) {
    return (
      <div className="mf-empty" style={{ padding: 40, textAlign: "center" }}>
        読み込み中…
      </div>
    );
  }
  if (me.profile.role === "family") return <FamilyDashboard slug={slug} />;
  if (me.profile.role === "kiosk") return <KioskDashboard slug={slug} />;

  return (
    <DashboardProvider slug={slug} initialMe={me}>
      <DashboardInner />
    </DashboardProvider>
  );
}

function LowStockBanner({ onOpenInventory }: { onOpenInventory: () => void }) {
  const { lowStockItems } = useDashboard();
  const [dismissed, setDismissed] = useState(false);

  if (lowStockItems.length === 0 || dismissed) return null;

  const names = lowStockItems.slice(0, 3).map((i) => i.name).join("・");
  const rest = lowStockItems.length > 3 ? ` 他${lowStockItems.length - 3}件` : "";

  return (
    <div className="mf-pinbar" style={{ background: "#181E25", border: "1px solid rgba(242,109,95,0.35)", borderRadius: 10, padding: "10px 14px" }}>
      <span>
        ⚠ 在庫が少なくなっています: {names}
        {rest}
      </span>
      <button className="mf-btn primary" onClick={onOpenInventory}>
        在庫を見る
      </button>
      <button className="mf-btn ghost" onClick={() => setDismissed(true)}>
        あとで
      </button>
    </div>
  );
}

function DashboardInner() {
  const router = useRouter();
  const { slug, me, monthKey, setMonthKey, loading } = useDashboard();
  const [view, setView] = useState<string>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外をタップ/クリックしたら閉じる。開閉はReact stateのみで制御し、
  // CSSの:hover/:focus-within頼みにはしない — クリックしたdrawitemがフォーカスを
  // 保持し続けると:focus-withinがメニューを開いたままにしてしまい、
  // その下の要素（例: メンテナンスの「完了」ボタン）がタップ不能になるため。
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const logout = async () => {
    await apiPost("/api/auth/logout");
    sessionStorage.removeItem(`unlocked:${slug}`);
    router.push(`/${slug}`);
  };

  return (
    <div className="mf-root">
      <div className="mf-banner">
        <img src="/banner-wedding.jpg" alt="" />
      </div>
      <header className="mf-header">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <div className="mf-menuwrap" ref={menuRef}>
            <button className="mf-menubtn" aria-haspopup="true" aria-expanded={menuOpen} aria-label="メニュー" onClick={() => setMenuOpen((o) => !o)}>
              ☰
            </button>
            <div className={"mf-drawer" + (menuOpen ? " open" : "")}>
              {MENU_GROUPS.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <div className="mf-drawsep" />}
                  <div className="mf-drawgroup">{group.label}</div>
                  {group.items.map(([id, label]) => (
                    <button key={id} className={"mf-drawitem" + (view === id ? " active" : "")} onClick={() => { setView(id); setMenuOpen(false); }}>
                      {label}
                    </button>
                  ))}
                </div>
              ))}
              <div className="mf-drawsep" />
              <button className="mf-drawitem" onClick={() => router.push(`/${slug}/quick`)}>
                ⚡ クイック入力
              </button>
              <button className="mf-drawitem" onClick={() => router.push(`/${slug}/kiosk`)}>
                🖥 常設ダッシュボード
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
        <LowStockBanner onOpenInventory={() => setView("inventory")} />
      </div>

      <main className="mf-main">
        {loading && !me ? (
          <div className="mf-empty" style={{ padding: 40, textAlign: "center" }}>
            読み込み中…
          </div>
        ) : (
          <>
            {view === "home" && <Home />}
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
            {view === "wishlist" && <Wishlist />}
            {view === "lifeEvents" && <LifeEvents />}
            {view === "maintenance" && <Maintenance />}
            {view === "inventory" && <Inventory />}
            {view === "journal" && <Journal />}
            {view === "ideaBoard" && <IdeaBoard />}
            {view === "records" && <Records />}
            {view === "reminders" && <Reminders />}
            {view === "flowAnalysis" && <FlowAnalysis />}
            {view === "gymLog" && <GymLog />}
            {view === "mealLog" && <MealLog />}
            {view === "shoppingList" && <ShoppingList />}
            {view === "smartHome" && <SmartHome />}
            {view === "splitEvents" && <SplitEvents />}
            {view === "anniversaries" && <Anniversaries />}
            {view === "yearTimeline" && <YearTimeline />}
            {view === "settings" && <Settings />}
          </>
        )}
        <footer className="mf-footer">データはこのアプリのサーバーに保存されます。投資に関する情報は参考情報であり、投資判断はご自身の責任で。</footer>
      </main>
      <AgentWidget />
      <AppBadgeSync />
    </div>
  );
}
