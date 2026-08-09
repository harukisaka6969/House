"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { fmt } from "@/lib/judge";
import { todayStrJST } from "@/lib/date";
import { TONE_COLOR } from "@/lib/constants";
import type { KioskResponse, ShoppingItemOut, ShoppingStore, RecurrenceType } from "@/lib/apiTypes";
import { recurrenceLabel, DOW } from "./sections/Reminders";

const REFRESH_MS = 60_000;
const STORE_LABEL: Record<ShoppingStore, string> = { seiyu: "西友", amazon: "Amazon", conveni: "コンビニ", other: "その他" };

const emptyReminderForm = {
  name: "",
  recurrence_type: "weekly" as RecurrenceType,
  day_of_week: 2,
  day_of_month: 1,
  memo: "",
  assignedTo: "",
};

function RemindersPanel({ data, onChanged }: { data: KioskResponse; onChanged: () => void }) {
  const [showFuture, setShowFuture] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyReminderForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const today = todayStrJST();
  const todayReminders = data.reminders.filter((r) => r.next_date <= today);
  const futureReminders = data.reminders.filter((r) => r.next_date > today);

  const submit = async () => {
    if (!form.name.trim() || busy) return;
    setBusy(true);
    setMsg("");
    try {
      await apiPost("/api/kiosk/reminders", {
        name: form.name,
        recurrence_type: form.recurrence_type,
        day_of_week: form.recurrence_type === "weekly" ? form.day_of_week : undefined,
        day_of_month: form.recurrence_type === "monthly" ? form.day_of_month : undefined,
        memo: form.memo,
        assigned_to: form.assignedTo || null,
      });
      setForm(emptyReminderForm);
      setShowForm(false);
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "追加に失敗しました。");
    }
    setBusy(false);
  };

  return (
    <div className="kiosk-panel kiosk-reminders">
      <div className="kiosk-row-head">
        <div className="kiosk-panelhead" style={{ marginBottom: 0 }}>
          📅 やること（今日）
        </div>
        <button className="kiosk-linkbtn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "× 閉じる" : "＋ 追加"}
        </button>
      </div>

      {showForm && (
        <div className="kiosk-addform">
          <input
            className="mf-input"
            placeholder="例: ゴミ出し、クララに薬"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="mf-chips" style={{ marginTop: 8 }}>
            {(
              [
                ["daily", "毎日"],
                ["weekly", "毎週"],
                ["monthly", "毎月"],
              ] as [RecurrenceType, string][]
            ).map(([v, label]) => (
              <button key={v} className={"mf-chipbtn" + (form.recurrence_type === v ? " on" : "")} onClick={() => setForm({ ...form, recurrence_type: v })}>
                {label}
              </button>
            ))}
          </div>
          {form.recurrence_type === "weekly" && (
            <div className="mf-chips" style={{ marginTop: 6 }}>
              {DOW.map((d, i) => (
                <button key={d} className={"mf-chipbtn" + (form.day_of_week === i ? " on" : "")} onClick={() => setForm({ ...form, day_of_week: i })}>
                  {d}曜日
                </button>
              ))}
            </div>
          )}
          {form.recurrence_type === "monthly" && (
            <input
              className="mf-input mf-mono"
              type="number"
              min={1}
              max={31}
              style={{ marginTop: 6, width: 100 }}
              value={form.day_of_month}
              onChange={(e) => setForm({ ...form, day_of_month: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
            />
          )}
          <div className="mf-quicklabel" style={{ marginTop: 8 }}>
            実行者（任意）
          </div>
          <div className="mf-chips">
            <button className={"mf-chipbtn" + (form.assignedTo === "" ? " on" : "")} onClick={() => setForm({ ...form, assignedTo: "" })}>
              未定
            </button>
            <button className={"mf-chipbtn" + (form.assignedTo === data.left.id ? " on" : "")} onClick={() => setForm({ ...form, assignedTo: data.left.id })}>
              {data.left.name}
            </button>
            <button className={"mf-chipbtn" + (form.assignedTo === data.right.id ? " on" : "")} onClick={() => setForm({ ...form, assignedTo: data.right.id })}>
              {data.right.name}
            </button>
          </div>
          <input
            className="mf-input"
            style={{ marginTop: 8 }}
            placeholder="メモ（任意）"
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
          />
          <button className="mf-btn primary" style={{ marginTop: 8 }} disabled={busy} onClick={submit}>
            追加する
          </button>
          {msg && <div className="mf-hint">{msg}</div>}
        </div>
      )}

      {todayReminders.length === 0 ? (
        <div className="kiosk-empty">今日やることはありません</div>
      ) : (
        <div className="kiosk-reminderrow-wrap">
          {todayReminders.map((r) => (
            <div key={r.id} className="kiosk-reminderchip">
              <b>{r.name}</b>
              <span>
                {recurrenceLabel(r)}
                {r.assigned_to_name && ` ・ ${r.assigned_to_name}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {futureReminders.length > 0 && (
        <>
          <button className="kiosk-linkbtn" style={{ marginTop: 10 }} onClick={() => setShowFuture((s) => !s)}>
            {showFuture ? "▾" : "▸"} 今後の予定（{futureReminders.length}件）
          </button>
          {showFuture && (
            <div className="kiosk-reminderrow-wrap" style={{ marginTop: 8 }}>
              {futureReminders.map((r) => (
                <div key={r.id} className="kiosk-reminderchip" style={{ opacity: 0.75 }}>
                  <b>{r.name}</b>
                  <span>
                    {recurrenceLabel(r)} ・ {r.next_date}
                    {r.assigned_to_name && ` ・ ${r.assigned_to_name}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

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

export default function KioskDashboard({ slug, exitHref }: { slug: string; exitHref?: string }) {
  const [data, setData] = useState<KioskResponse | null>(null);

  const load = () => apiGet<KioskResponse>("/api/kiosk").then(setData).catch(() => {});
  useEffect(() => {
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

      <RemindersPanel data={data} onChanged={load} />

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

      {exitHref && (
        <a className="kiosk-exit" href={exitHref}>
          ← 通常画面に戻る
        </a>
      )}
    </div>
  );
}
