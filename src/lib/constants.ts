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

/** よくあるメンテタスクのテンプレ（spec v2 §4.2-4: ワンタップ挿入用）。est_costは目安。 */
export const MAINTENANCE_TEMPLATES: Record<string, { name: string; intervalMonths: number | null; estCost: number }[]> = {
  car: [
    { name: "車検", intervalMonths: 24, estCost: 100000 },
    { name: "オイル交換", intervalMonths: 6, estCost: 8000 },
    { name: "タイヤ交換", intervalMonths: 48, estCost: 80000 },
    { name: "自動車保険更新", intervalMonths: 12, estCost: 60000 },
  ],
  house: [
    { name: "火災保険更新", intervalMonths: 12, estCost: 30000 },
    { name: "防蟻処理", intervalMonths: 60, estCost: 150000 },
    { name: "外壁点検", intervalMonths: 60, estCost: 20000 },
  ],
  appliance: [{ name: "定期清掃", intervalMonths: 12, estCost: 15000 }],
  other: [],
};

export const ASSET_KINDS: { id: string; label: string }[] = [
  { id: "car", label: "車" },
  { id: "house", label: "家" },
  { id: "appliance", label: "機器" },
  { id: "other", label: "その他" },
];

export const TONE_COLOR: Record<string, string> = {
  good: "#45C48F",
  ok: "#4C9AFF",
  warn: "#F5A524",
  bad: "#F26D5F",
  muted: "#93A0AE",
};
