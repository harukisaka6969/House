"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import { TONE_COLOR } from "@/lib/constants";
import type { KioskResponse, ShoppingItemOut, ShoppingStore } from "@/lib/apiTypes";
import { recurrenceLabel } from "./sections/Reminders";

const REFRESH_MS = 60_000;
const STORE_LABEL: Record<ShoppingStore, string> = { seiyu: "西友", amazon: "Amazon", conveni: "コンビニ", other: "その他" };

function ShoppingColumn({ name, items }: { name: string; items: ShoppingItemOut[] }) {
  return (
    <div className="kiosk-col">
      <div className="kiosk-colname">{name}</div>
      {items.length === 0 ? (
        <div className="kiosk-empty">買うものはありません</div>
      ) : (
        <div className="kiosk-itemlist">
          {items.map((i) => (
            <div key={i.id} className="kiosk-item">
              <span className="kiosk-itemname">{i.name}</span>
              <span className="kiosk-itemmeta">
                {STORE_LABEL[i.store]}
                {i.needs_approval && !i.approved && " ・承認待ち"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationBell({ data }: { data: KioskResponse }) {
  const [open, setOpen] = useState(false);
  const count = data.notifications.pendingApprovalItems.length + data.notifications.remindersToday.length + data.notifications.lowStockItems.length;

  return (
    <div className="kiosk-bellwrap">
      <button className="kiosk-bell" onClick={() => setOpen((o) => !o)} aria-label="重要な通知">
        🔔
        {count > 0 && <span className="kiosk-bellbadge">{count}</span>}
      </button>
      {open && (
        <div className="kiosk-bellpanel">
          {count === 0 ? (
            <div className="kiosk-empty">重要な通知はありません</div>
          ) : (
            <>
              {data.notifications.pendingApprovalItems.map((i) => (
                <div key={i.id} className="kiosk-notifrow">
                  🛒 {i.name}（{i.owner_name}）の承認待ち
                </div>
              ))}
              {data.notifications.remindersToday.map((r) => (
                <div key={r.id} className="kiosk-notifrow">
                  🔔 今日: {r.name}
                </div>
              ))}
              {data.notifications.lowStockItems.map((i) => (
                <div key={i.id} className="kiosk-notifrow">
                  ⚠ {i.name} が在庫少
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const date = now.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
  const time = now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="kiosk-clock">
      <span className="kiosk-time">{time}</span>
      <span className="kiosk-date">{date}</span>
    </div>
  );
}

export default function KioskDashboard({ slug }: { slug: string }) {
  const [data, setData] = useState<KioskResponse | null>(null);

  useEffect(() => {
    const load = () => apiGet<KioskResponse>("/api/kiosk").then(setData).catch(() => {});
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  if (!data) {
    return (
      <div className="kiosk-root">
        <div className="kiosk-empty" style={{ padding: 60, textAlign: "center" }}>
          読み込み中…
        </div>
      </div>
    );
  }

  return (
    <div className="kiosk-root">
      <div className="kiosk-top">
        <div className="kiosk-topleft">
          <div className="kiosk-eyebrow">SAKA HOUSEHOLD LEDGER</div>
          <div className="kiosk-title">常設ダッシュボード</div>
        </div>
        <Clock />
        <NotificationBell data={data} />
      </div>

      <div className="kiosk-panel kiosk-reminders">
        <div className="kiosk-panelhead">📅 やること</div>
        {data.reminders.length === 0 ? (
          <div className="kiosk-empty">リマインダーはありません</div>
        ) : (
          <div className="kiosk-reminderrow-wrap">
            {data.reminders.slice(0, 8).map((r) => (
              <div key={r.id} className="kiosk-reminderchip">
                <b>{r.name}</b>
                <span>{recurrenceLabel(r)} ・ {r.next_date}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="kiosk-columns">
        <ShoppingColumn name={data.left.name} items={data.left.shoppingItems} />
        <ShoppingColumn name={data.right.name} items={data.right.shoppingItems} />
      </div>

      <div className="kiosk-bottom">
        <div className="kiosk-moneystat">
          <span className="kiosk-moneylabel">収入</span>
          <span className="kiosk-moneyval">{fmt(data.income)}</span>
        </div>
        <div className="kiosk-moneystat">
          <span className="kiosk-moneylabel">支出</span>
          <span className="kiosk-moneyval" style={{ color: "#F26D5F" }}>
            {fmt(data.expense)}
          </span>
        </div>
        <div className="kiosk-moneystat">
          <span className="kiosk-moneylabel">判定</span>
          <span className="kiosk-moneyval" style={{ color: TONE_COLOR[data.judgeTone] }}>
            {data.judgeLabel}
          </span>
        </div>
        {data.accounts.map((a) => (
          <div key={a.id} className="kiosk-moneystat">
            <span className="kiosk-moneylabel">
              <span className="mf-dot" style={{ background: a.color }} /> {a.name.replace(/（.*）/, "")}
            </span>
            <span className="kiosk-moneyval" style={{ color: TONE_COLOR[a.judgeTone], fontSize: 15 }}>
              {fmt(a.spent)} / {fmt(a.budget)}
            </span>
          </div>
        ))}
      </div>

      <a className="kiosk-exit" href={`/${slug}/app`}>
        ← 通常画面に戻る
      </a>
    </div>
  );
}
