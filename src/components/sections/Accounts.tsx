"use client";

import { fmt } from "@/lib/judge";
import { TONE_COLOR, PRIVATE_ACCOUNT } from "@/lib/constants";
import { SectionHead, MoneyViewToggle } from "../common";
import { useDashboard } from "../DashboardContext";
import AccountDetail from "./AccountDetail";

export default function Accounts() {
  const { month, me, ownerFilter } = useDashboard();
  if (!month) return null;
  const meName = me?.profile.name ?? "";
  const showMineNote = ownerFilter === null || ownerFilter === me?.profile.id;

  return (
    <section className="mf-section">
      <SectionHead no="03" title="口座別の状況" sub="4つの口座それぞれの予算消化と判定。" />
      <MoneyViewToggle />
      <div className="mf-acctgrid">
        {month.aggregates.perAccount.map((a) => {
          const rate = a.budget ? Math.min(a.spent / a.budget, 1.5) : 0;
          return (
            <div key={a.id} className="mf-acctcard">
              <div className="mf-acctname">
                <span className="mf-dot" style={{ background: a.color }} />
                {a.name}
                <span className="mf-chip" style={{ color: TONE_COLOR[a.judge.tone], borderColor: TONE_COLOR[a.judge.tone] }}>
                  {a.judge.label}
                </span>
              </div>
              <div className="mf-acctnums">
                <span className="mf-num">{fmt(a.spent)}</span>
                <span className="mf-numsub"> / 予算 {fmt(a.budget)}</span>
              </div>
              <div className="mf-bar">
                <div className="mf-barfill" style={{ width: `${Math.min(rate * 100, 100)}%`, background: a.spent > a.budget ? "#F26D5F" : a.color }} />
              </div>
              <div className="mf-numsub" style={{ marginTop: 4 }}>
                残り {fmt(Math.max(a.budget - a.spent, 0))}
                {a.spent > a.budget && ` ／ 超過 ${fmt(a.spent - a.budget)}`}
                {a.id === PRIVATE_ACCOUNT && showMineNote && (
                  <span>
                    {" "}
                    ／ うち{meName}の分 {fmt(a.spentMine)} 🔒
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mf-hint" style={{ opacity: 0.75 }}>
        🔒 第3口座はプライベート口座。相手の明細はカテゴリのみ表示され、日付・金額・メモは互いに見えません（口座の月合計のみ共有）。
      </div>
      <AccountDetail accounts={month.aggregates.perAccount} expenses={month.expenses} />
    </section>
  );
}
