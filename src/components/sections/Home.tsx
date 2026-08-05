"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { fmt, monthJudge } from "@/lib/judge";
import { TONE_COLOR } from "@/lib/constants";
import { todayStrJST, addDaysStr, dayOfWeek } from "@/lib/date";
import type { MealLogOut, PfcTargetOut, SportLogOut, MaintenanceTaskOut, ReminderOut } from "@/lib/apiTypes";
import { SectionHead, StatCard } from "../common";
import { useDashboard } from "../DashboardContext";
import DigestBanner from "../DigestBanner";
import { recurrenceLabel } from "./Reminders";

type UpcomingTask = MaintenanceTaskOut & { asset_name: string };

function dsub(cur: number, pv: number | null | undefined): string | null {
  if (pv == null) return null;
  return (cur - pv >= 0 ? "+" : "") + fmt(cur - pv) + " 前月比";
}

/** 全体のダッシュボード。お金・健康・リマインダーなどを横断で見られる、アプリを開いたときの最初の画面。 */
export default function Home() {
  const { me, month, prevMonth, monthKey, lowStockItems } = useDashboard();
  const [meals, setMeals] = useState<MealLogOut[] | null>(null);
  const [target, setTarget] = useState<PfcTargetOut | null>(null);
  const [sportLogs, setSportLogs] = useState<SportLogOut[] | null>(null);
  const [upcomingTasks, setUpcomingTasks] = useState<UpcomingTask[] | null>(null);
  const [reminders, setReminders] = useState<ReminderOut[] | null>(null);
  const [notif, setNotif] = useState<{ pendingApprovals: number; newMeals: number } | null>(null);

  useEffect(() => {
    apiGet<{ logs: MealLogOut[] }>(`/api/meal-logs?month=${monthKey}`).then((r) => setMeals(r.logs)).catch(() => setMeals([]));
    apiGet<{ entries: unknown[]; sportLogs: SportLogOut[] }>(`/api/journal?month=${monthKey}`).then((r) => setSportLogs(r.sportLogs)).catch(() => setSportLogs([]));
  }, [monthKey]);

  useEffect(() => {
    apiGet<{ target: PfcTargetOut | null }>("/api/pfc-target").then((r) => setTarget(r.target)).catch(() => {});
    apiGet<{ upcoming: UpcomingTask[] }>("/api/maintenance/upcoming?months=2").then((r) => setUpcomingTasks(r.upcoming)).catch(() => setUpcomingTasks([]));
    apiGet<{ reminders: ReminderOut[] }>("/api/reminders").then((r) => setReminders(r.reminders)).catch(() => setReminders([]));
    apiGet<{ pendingApprovals: number; newMeals: number }>("/api/notifications/count").then(setNotif).catch(() => {});
  }, []);

  const today = todayStrJST();

  const todayMeals = (meals ?? []).filter((m) => m.date === today);
  const mealTotals = todayMeals.reduce(
    (acc, m) => ({ calories: acc.calories + m.calories, protein_g: acc.protein_g + m.protein_g }),
    { calories: 0, protein_g: 0 }
  );

  const dow = dayOfWeek(today);
  const weekStart = addDaysStr(today, dow === 0 ? -6 : -(dow - 1));
  const gymVisitsThisWeek = new Set(
    (sportLogs ?? []).filter((s) => s.owner === me?.profile.id && s.activity.includes("ジム") && s.date >= weekStart && s.date <= today).map((s) => s.date)
  ).size;

  const upcomingReminders = (reminders ?? []).filter((r) => r.active && r.next_date <= addDaysStr(today, 7)).slice(0, 5);
  const upcomingMaintenance = (upcomingTasks ?? []).slice(0, 3);

  return (
    <section className="mf-section">
      <SectionHead no="19" title="ホーム" sub="お金・健康・食事・リマインダーなどをまとめて見られる、全体のダッシュボードです。" />

      <DigestBanner />

      {month && (
        <div className="mf-panel">
          <div className="mf-paneltitle">💰 お金（{monthKey.replace("-", "年")}月）</div>
          <div className="mf-cards4">
            <StatCard label="収入" value={fmt(month.aggregates.monthTotals.income)} color="#E7ECF2" sub={dsub(month.aggregates.monthTotals.income, prevMonth?.aggregates.monthTotals.income)} />
            <StatCard label="支出" value={fmt(month.aggregates.monthTotals.expense)} color="#F26D5F" sub={dsub(month.aggregates.monthTotals.expense, prevMonth?.aggregates.monthTotals.expense)} />
            <StatCard
              label="収支"
              value={
                (month.aggregates.monthTotals.income - month.aggregates.monthTotals.expense > 0 ? "+" : "") +
                fmt(month.aggregates.monthTotals.income - month.aggregates.monthTotals.expense)
              }
              color={month.aggregates.monthTotals.income - month.aggregates.monthTotals.expense >= 0 ? "#45C48F" : "#F26D5F"}
            />
            {(() => {
              const judge = monthJudge(month.aggregates.monthTotals.income, month.aggregates.monthTotals.expense);
              return <StatCard label="判定" value={judge.label} color={TONE_COLOR[judge.tone]} />;
            })()}
          </div>
        </div>
      )}

      <div className="mf-panel">
        <div className="mf-paneltitle">🍚 健康・食事（今日）</div>
        <div className="mf-row" style={{ justifyContent: "space-between" }}>
          <span>今日の食事</span>
          <span className="mf-mono">
            {Math.round(mealTotals.calories)}
            {target ? ` / ${Math.round(target.calories)}` : ""}kcal（P{Math.round(mealTotals.protein_g)}g・{todayMeals.length}件）
          </span>
        </div>
        <div className="mf-row" style={{ justifyContent: "space-between", marginTop: 4 }}>
          <span>今週のジム</span>
          <span className="mf-mono">{gymVisitsThisWeek}日</span>
        </div>
      </div>

      <div className="mf-panel">
        <div className="mf-paneltitle">📅 近日の予定</div>
        {upcomingReminders.length === 0 && upcomingMaintenance.length === 0 ? (
          <div className="mf-empty">1週間以内の予定はありません。</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcomingReminders.map((r) => (
              <div key={r.id} className="mf-row" style={{ justifyContent: "space-between" }}>
                <span>🔔 {r.name}</span>
                <span className="mf-hint" style={{ margin: 0 }}>
                  {recurrenceLabel(r)} ・ {r.next_date === today ? "今日" : r.next_date}
                </span>
              </div>
            ))}
            {upcomingMaintenance.map((t) => (
              <div key={t.id} className="mf-row" style={{ justifyContent: "space-between" }}>
                <span>🔧 {t.asset_name}: {t.name}</span>
                <span className="mf-hint" style={{ margin: 0 }}>
                  {t.next_due}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {(lowStockItems.length > 0 || (notif && notif.pendingApprovals > 0)) && (
        <div className="mf-panel">
          <div className="mf-paneltitle">🛒 買い物・在庫</div>
          {notif && notif.pendingApprovals > 0 && (
            <div className="mf-row" style={{ justifyContent: "space-between" }}>
              <span>承認待ちの買い物</span>
              <span className="mf-mono">{notif.pendingApprovals}件</span>
            </div>
          )}
          {lowStockItems.length > 0 && (
            <div className="mf-row" style={{ justifyContent: "space-between", marginTop: 4 }}>
              <span>在庫が少ないもの</span>
              <span className="mf-mono">{lowStockItems.map((i) => i.name).slice(0, 3).join("・")}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
