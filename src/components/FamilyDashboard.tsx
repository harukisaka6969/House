"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import type { MeResponse, FamilyOverviewResponse } from "@/lib/apiTypes";

type Tab = "calendar" | "wishlist" | "future";

const ICON: Record<string, string> = { maintenance: "🔧", wishlist: "🛒", life_event: "🏠" };

export default function FamilyDashboard({ slug }: { slug: string }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<FamilyOverviewResponse | null>(null);
  const [tab, setTab] = useState<Tab>("calendar");

  useEffect(() => {
    apiGet<MeResponse>("/api/auth/me").then(setMe).catch(() => {});
    apiGet<FamilyOverviewResponse>("/api/family/overview").then(setData).catch(() => {});
  }, []);

  const logout = async () => {
    await apiPost("/api/auth/logout");
    router.push(`/${slug}`);
  };

  return (
    <div className="mf-root">
      <header className="mf-header">
        <div>
          <div className="mf-eyebrow">SAKA HOUSEHOLD LEDGER</div>
          <h1 className="mf-title">
            坂家の予定{" "}
            <span className="mf-badge" style={{ marginLeft: 8, verticalAlign: "middle" }}>
              閲覧専用
            </span>
          </h1>
        </div>
        <div className="mf-headright">
          <span className="mf-numsub">{me?.profile.name}</span>
          <button className="mf-btn ghost" onClick={logout}>
            ログアウト
          </button>
        </div>
      </header>

      <main className="mf-main">
        <div className="mf-profiletabs" style={{ marginBottom: 14 }}>
          <button className={"mf-ptab" + (tab === "calendar" ? " active" : "")} onClick={() => setTab("calendar")}>
            📅 予定カレンダー
          </button>
          <button className={"mf-ptab" + (tab === "wishlist" ? " active" : "")} onClick={() => setTab("wishlist")}>
            🛒 買う予定のもの
          </button>
          <button className={"mf-ptab" + (tab === "future" ? " active" : "")} onClick={() => setTab("future")}>
            🏠 将来設計・メンテ
          </button>
        </div>

        {!data ? (
          <div className="mf-empty">読み込み中…</div>
        ) : (
          <>
            {tab === "calendar" && (
              <div className="mf-panel">
                {data.timeline.every((m) => m.items.length === 0) ? (
                  <div className="mf-empty">今後18ヶ月に予定はありません。</div>
                ) : (
                  data.timeline
                    .filter((m) => m.items.length > 0)
                    .map((m) => (
                      <div key={m.month} style={{ marginBottom: 14 }}>
                        <div className="mf-row" style={{ justifyContent: "space-between" }}>
                          <span className="mf-paneltitle" style={{ margin: 0 }}>
                            {m.month.replace("-", "年")}月
                          </span>
                          <span className="mf-mono">{fmt(m.subtotal)}</span>
                        </div>
                        <div className="mf-list">
                          {m.items.map((it) => (
                            <div key={`${it.type}-${it.id}`} className="mf-listrow">
                              <span className="mf-listcat">
                                {ICON[it.type]} {it.name}
                              </span>
                              <span className="mf-mono mf-listamt">{fmt(it.cost)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}

            {tab === "wishlist" && (
              <div className="mf-acctgrid">
                {data.wishlist.length === 0 && <div className="mf-empty">買う予定のものはまだありません。</div>}
                {data.wishlist.map((w) => (
                  <div key={w.id} className="mf-acctcard">
                    <div className="mf-acctname">
                      {w.name}
                      <span className="mf-chip" style={{ borderColor: "#8B7CF6", color: "#8B7CF6" }}>
                        優先度 {w.priority}
                      </span>
                    </div>
                    {w.category && <div className="mf-numsub">{w.category}</div>}
                    <div className="mf-acctnums">
                      <span className="mf-num">{fmt(w.price)}</span>
                    </div>
                    {w.target_date && <div className="mf-numsub">目標時期: {w.target_date}</div>}
                  </div>
                ))}
              </div>
            )}

            {tab === "future" && (
              <>
                <div className="mf-panel">
                  <div className="mf-paneltitle">将来設計</div>
                  {data.lifeEvents.length === 0 ? (
                    <div className="mf-empty">予定はまだありません。</div>
                  ) : (
                    <div className="mf-list">
                      {data.lifeEvents.map((e) => (
                        <div key={e.id} className="mf-listrow">
                          <span className="mf-listcat">
                            {e.event_year}年{e.event_month ? `${e.event_month}月` : ""} {e.name}
                          </span>
                          <span className="mf-listmemo">{e.memo}</span>
                          <span className="mf-mono mf-listamt">
                            {fmt(e.cost_low)} 〜 {fmt(e.cost_high)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mf-panel">
                  <div className="mf-paneltitle">今後のメンテ予定</div>
                  {data.maintenance.length === 0 ? (
                    <div className="mf-empty">予定はまだありません。</div>
                  ) : (
                    <div className="mf-list">
                      {data.maintenance.map((t) => (
                        <div key={t.id} className="mf-listrow">
                          <span className="mf-listcat">
                            {t.asset_name}: {t.name}
                          </span>
                          <span className="mf-listmemo">{t.next_due}</span>
                          <span className="mf-mono mf-listamt">{fmt(t.est_cost)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
        <footer className="mf-footer">閲覧専用アカウントです。財務状態（貯蓄・収支・実績）は表示されません。</footer>
      </main>
    </div>
  );
}
