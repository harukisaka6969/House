export const PRIVATE_ACCOUNT = "a3";

export const CATEGORIES = [
  "食費", "外食", "住居", "水道光熱", "通信", "交通",
  "日用品", "趣味", "ペット", "医療", "交際費", "旅行", "投資", "その他",
] as const;

export const CAT_COLORS = [
  "#F5A524", "#2FB8A6", "#4C9AFF", "#8B7CF6", "#E86A92", "#6FCF6F",
  "#D9A0FF", "#FFB380", "#63C7E8", "#C9B458", "#FF8A7A", "#7FD1B9", "#B0A8FF", "#9AA4B2",
] as const;

export const DEFAULT_ACCOUNTS = [
  { id: "a1", name: "第1口座（生活費）", color: "#F5A524", budget: 180000, sort: 1 },
  { id: "a2", name: "第2口座（ローン等）", color: "#63C7E8", budget: 0, sort: 2 },
  { id: "a3", name: "第3口座（趣味・娯楽・交際）", color: "#2FB8A6", budget: 60000, sort: 3 },
  { id: "a4", name: "第4口座（投資）", color: "#8B7CF6", budget: 80000, sort: 4 },
] as const;

export const TONE_COLOR: Record<string, string> = {
  good: "#45C48F",
  ok: "#4C9AFF",
  warn: "#F5A524",
  bad: "#F26D5F",
  muted: "#93A0AE",
};
