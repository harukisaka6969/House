"use client";

import { fmt } from "@/lib/judge";
import type { AccountAggregateOut } from "@/lib/apiTypes";

export default function FlowDiagram({ income, accounts }: { income: number; accounts: AccountAggregateOut[] }) {
  const totalBudget = accounts.reduce((s, a) => s + (a.budget || 0), 0);
  if (income <= 0 && totalBudget <= 0) {
    return <div className="mf-panel mf-empty">収入（⑦設定）と口座予算を入力すると、ここに配分の流れが表示されます。</div>;
  }
  const base = Math.max(income, totalBudget, 1);
  const ROW = 82;
  const H = 24 + accounts.length * ROW;
  const leftH = Math.max((income / base) * (H - 60), 10);
  const leftY = 24 + (H - 60 - leftH) / 2;

  const divisor = Math.max(income, totalBudget, 1);
  const rows = accounts.reduce<Array<AccountAggregateOut & { y: number; nodeH: number; srcY: number; srcH: number }>>((acc, a, i) => {
    const nodeH = Math.max(((a.budget || 0) / base) * (H - 80), 8);
    const srcH = income > 0 ? Math.max(leftH * ((a.budget || 0) / divisor), 3) : 0;
    const srcY = acc.length ? acc[acc.length - 1].srcY + acc[acc.length - 1].srcH : leftY;
    acc.push({ ...a, y: 20 + i * ROW, nodeH: Math.min(nodeH, 56), srcY, srcH });
    return acc;
  }, []);
  const totalSpent = accounts.reduce((s, a) => s + (a.spent || 0), 0);
  const unalloc = income - totalSpent;

  return (
    <div className="mf-panel">
      <div className="mf-flowwrap">
        <svg viewBox={`0 0 640 ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="収入から口座への配分の流れ">
          <defs>
            {rows.map((r) => (
              <linearGradient key={r.id} id={`g-${r.id}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#8B949E" stopOpacity="0.25" />
                <stop offset="100%" stopColor={r.color} stopOpacity="0.5" />
              </linearGradient>
            ))}
          </defs>
          <rect x="20" y={leftY} width="18" height={leftH} rx="4" fill="#E7ECF2" opacity="0.9" />
          <text x="20" y={Math.max(leftY - 8, 12)} fill="#93A0AE" fontSize="11">
            収入
          </text>
          <text x="20" y={leftY + leftH + 16} fill="#E7ECF2" fontSize="12" className="mf-mono">
            {fmt(income)}
          </text>
          {rows.map((r) => {
            const x0 = 38,
              x1 = 250;
            const nodeY = r.y + 6;
            const path = `M ${x0} ${r.srcY} C ${x0 + 95} ${r.srcY}, ${x1 - 95} ${nodeY}, ${x1} ${nodeY}
                          L ${x1} ${nodeY + r.nodeH} C ${x1 - 95} ${nodeY + r.nodeH}, ${x0 + 95} ${r.srcY + r.srcH}, ${x0} ${r.srcY + r.srcH} Z`;
            const usedRate = r.budget ? Math.min(r.spent / r.budget, 1) : 0;
            return (
              <g key={r.id}>
                {income > 0 && <path d={path} fill={`url(#g-${r.id})`} />}
                <rect x={x1} y={nodeY} width="12" height={r.nodeH} rx="3" fill={r.color} />
                <text x={x1 + 24} y={r.y + 16} fill="#E7ECF2" fontSize="13">
                  {r.name}
                </text>
                <text x={x1 + 24} y={r.y + 34} fill="#93A0AE" fontSize="11" className="mf-mono">
                  {fmt(r.spent)} / {fmt(r.budget)}（{r.budget ? Math.round((r.spent / r.budget) * 100) : 0}%）
                </text>
                <rect x={x1 + 24} y={r.y + 43} width="330" height="6" rx="3" fill="rgba(255,255,255,0.08)" />
                <rect x={x1 + 24} y={r.y + 43} width={330 * usedRate} height="6" rx="3" fill={r.spent > r.budget ? "#F26D5F" : r.color} />
                {r.spent > r.budget && (
                  <text x={x1 + 24} y={r.y + 64} fill="#F26D5F" fontSize="11">
                    超過 {fmt(r.spent - r.budget)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mf-flowfoot">
        {unalloc > 0 && (
          <span>
            未配分（自由に使える余力）: <b className="mf-mono" style={{ color: "#45C48F" }}>{fmt(unalloc)}</b>
          </span>
        )}
        {unalloc < 0 && <span style={{ color: "#F5A524" }}>支出合計が収入を {fmt(-unalloc)} 上回っています。使いすぎの口座を見直してください。</span>}
      </div>
    </div>
  );
}
