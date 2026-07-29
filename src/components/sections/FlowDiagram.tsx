"use client";

import { fmt } from "@/lib/judge";
import type { AccountAggregateOut } from "@/lib/apiTypes";

const MIN_ROW = 82;
const TOP_PAD = 24;
const NODE_PAD = 12;

export default function FlowDiagram({ income, accounts }: { income: number; accounts: AccountAggregateOut[] }) {
  const totalSpent = accounts.reduce((s, a) => s + (a.spent || 0), 0);
  if (income <= 0 && totalSpent <= 0) {
    return <div className="mf-panel mf-empty">収入（⑦設定）と支出を入力すると、ここに配分の流れが表示されます。</div>;
  }
  // 帯・ノードの縦の長さは実際の支出額に1:1で比例させる（予算額ではない、上限で潰さない）。
  // 行の高さは必要な分だけ伸び、隣の行と重ならないようにする。
  const base = Math.max(income, totalSpent, 1);
  const pxPerYen = (accounts.length * MIN_ROW) / base;

  let cursorY = TOP_PAD;
  let srcCursor = 0;
  const rows = accounts.map((a) => {
    const nodeH = Math.max((a.spent || 0) * pxPerYen, 8);
    const rowH = Math.max(nodeH + NODE_PAD * 2, MIN_ROW);
    const y = cursorY;
    const srcY0 = srcCursor;
    cursorY += rowH;
    srcCursor += nodeH;
    return { ...a, y, nodeH, srcH: nodeH, srcY0 };
  });
  const H = cursorY + 4;

  const leftH = Math.max(income * pxPerYen, 10);
  const leftY = Math.max(TOP_PAD, (H - leftH) / 2);
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
            const nodeY = r.y + NODE_PAD;
            const srcY = leftY + r.srcY0;
            const path = `M ${x0} ${srcY} C ${x0 + 95} ${srcY}, ${x1 - 95} ${nodeY}, ${x1} ${nodeY}
                          L ${x1} ${nodeY + r.nodeH} C ${x1 - 95} ${nodeY + r.nodeH}, ${x0 + 95} ${srcY + r.srcH}, ${x0} ${srcY + r.srcH} Z`;
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
