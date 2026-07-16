"use client";

import { useState } from "react";
import { fmt } from "@/lib/judge";
import { PRIVATE_ACCOUNT } from "@/lib/constants";
import type { AccountOut, ExpenseOut } from "@/lib/apiTypes";
import { useDashboard } from "../DashboardContext";

export default function AccountDetail({ accounts, expenses }: { accounts: AccountOut[]; expenses: ExpenseOut[] }) {
  const { me } = useDashboard();
  const meName = me?.profile.name ?? "";
  const [sel, setSel] = useState(accounts[0]?.id ?? "a1");
  const acct = accounts.find((a) => a.id === sel) ?? accounts[0];
  const rows = expenses.filter((e) => e.account_id === sel);
  const visible = rows.filter((e) => !e.masked);

  const cats = new Map<string, number>();
  visible.forEach((e) => {
    if (e.masked) return;
    cats.set(e.category, (cats.get(e.category) ?? 0) + (Number(e.amount) || 0));
  });
  const catRows = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  const maxV = catRows.length ? catRows[0][1] : 1;

  const sorted = [...visible].sort((a, b) => (b as { date: string }).date.localeCompare((a as { date: string }).date));
  const maskedRows = rows.filter((e) => e.masked);

  if (!acct) return null;

  return (
    <div className="mf-panel">
      <div className="mf-paneltitle">口座の詳細（ドリルダウン）</div>
      <div className="mf-chips">
        {accounts.map((a) => (
          <button key={a.id} className={"mf-chipbtn" + (sel === a.id ? " on" : "")} onClick={() => setSel(a.id)}>
            <span className="mf-dot" style={{ background: a.color }} />
            {a.name.replace(/（.*）/, "")}
          </button>
        ))}
      </div>
      <div className="mf-quicklabel">カテゴリ別金額{sel === PRIVATE_ACCOUNT ? "（相手の分は金額非公開のため除外）" : ""}</div>
      {catRows.length === 0 ? (
        <div className="mf-empty">この口座の支出はまだありません。</div>
      ) : (
        catRows.map(([name, v]) => (
          <div key={name} className="mf-catbar">
            <span className="mf-catbarname">{name}</span>
            <div className="mf-bar" style={{ flex: 1, marginTop: 0 }}>
              <div className="mf-barfill" style={{ width: `${(v / maxV) * 100}%`, background: acct.color }} />
            </div>
            <span className="mf-mono mf-catbaramt">{fmt(v)}</span>
          </div>
        ))
      )}
      {(sorted.length > 0 || maskedRows.length > 0) && (
        <>
          <div className="mf-quicklabel">明細（{sorted.length}件{maskedRows.length > 0 ? ` ／ 相手の非公開分 ${maskedRows.length}件` : ""}）</div>
          <div className="mf-list">
            {sorted.map((e) =>
              e.masked ? null : (
                <div key={e.id} className="mf-listrow">
                  <span className="mf-mono mf-listdate">{e.date.slice(5)}</span>
                  <span className="mf-listcat">
                    {e.category}
                    {e.sub ? `（${e.sub}）` : ""}
                  </span>
                  {e.owner_name !== meName && <span className="mf-ownerchip">{e.owner_name}</span>}
                  <span className="mf-listmemo">{e.memo}</span>
                  <span className="mf-mono mf-listamt">{fmt(e.amount)}</span>
                </div>
              )
            )}
            {maskedRows.map((e) => (
              <div key={e.id} className="mf-listrow" style={{ opacity: 0.75 }}>
                <span className="mf-mono mf-listdate">—</span>
                <span className="mf-listcat">{e.category}</span>
                <span className="mf-ownerchip">{e.owner_name}</span>
                <span className="mf-listmemo">🔒 非公開</span>
                <span className="mf-mono mf-listamt">¥•••••</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
