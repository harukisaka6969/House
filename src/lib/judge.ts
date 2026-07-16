import type { Judge } from "./types";

export function accountJudge(spent: number, budget: number): Judge {
  if (!budget) return { label: "予算未設定", tone: "muted" };
  const r = spent / budget;
  if (r <= 0.8) return { label: "余裕あり", tone: "good" };
  if (r <= 1.0) return { label: "順調", tone: "ok" };
  if (r <= 1.15) return { label: "注意", tone: "warn" };
  return { label: "使いすぎ", tone: "bad" };
}

export function monthJudge(income: number, expense: number): Judge {
  if (income <= 0 && expense <= 0) {
    return { label: "データなし", tone: "muted", note: "収入と支出を入力すると判定します。" };
  }
  if (income <= 0) {
    return { label: "収入未入力", tone: "muted", note: "収入を入力すると貯蓄率を判定できます。" };
  }
  const rate = (income - expense) / income;
  if (rate >= 0.25) return { label: "優秀", tone: "good", note: `貯蓄率 ${(rate * 100).toFixed(0)}%。この水準を維持できれば理想的。` };
  if (rate >= 0.1) return { label: "良好", tone: "ok", note: `貯蓄率 ${(rate * 100).toFixed(0)}%。健全なペース。` };
  if (rate >= 0) return { label: "注意", tone: "warn", note: `貯蓄率 ${(rate * 100).toFixed(0)}%。貯蓄余力がほぼない月。` };
  return { label: "使いすぎ", tone: "bad", note: `${fmt(expense - income)} の赤字。支出の内訳を確認。` };
}

export function fmt(n: number): string {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? "-¥" : "¥") + Math.abs(v).toLocaleString("ja-JP");
}
