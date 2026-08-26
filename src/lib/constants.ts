export const PRIVATE_ACCOUNT = "a3";

/** 「投資」は含めない — 投資の記録は第4口座・投資セクション（/api/investments）で専用に管理するため。 */
export const CATEGORIES = [
  "食費", "外食", "住居", "水道光熱", "通信", "交通", "車関係",
  "日用品", "趣味", "ペット", "医療", "交際費", "旅行", "その他",
] as const;

export const CAT_COLORS = [
  "#F5A524", "#2FB8A6", "#4C9AFF", "#8B7CF6", "#E86A92", "#6FCF6F", "#5FB8DE",
  "#D9A0FF", "#FFB380", "#63C7E8", "#C9B458", "#FF8A7A", "#7FD1B9", "#9AA4B2",
] as const;

/** 第1口座（生活必需）専用カテゴリ — 第3口座選択時はこれらを候補から外す。 */
export const A1_ONLY_CATEGORIES = ["食費", "住居", "水道光熱", "通信", "交通", "車関係", "日用品", "医療", "ペット"] as const;
/** 第3口座（趣味・娯楽・交際）専用カテゴリ — 第1口座選択時はこれらを候補から外す。
 * 「外食」は含めない — 毎日の必須の食事（第1口座）と、高額・カフェ・間食等の嗜好的な外食（第3口座）の
 * 両方であり得るため、どちらの口座でも選べるようにする。 */
export const A3_ONLY_CATEGORIES = ["趣味", "交際費", "旅行"] as const;

/** 選択中の口座に合わせてカテゴリ候補を絞り込む（第1/第3のみ対象、それ以外の口座は絞り込まない）。 */
export function categoriesForAccount(allCats: string[], accountId: string): string[] {
  if (accountId === "a1") return allCats.filter((c) => !(A3_ONLY_CATEGORIES as readonly string[]).includes(c));
  if (accountId === "a3") return allCats.filter((c) => !(A1_ONLY_CATEGORIES as readonly string[]).includes(c));
  return allCats;
}

export const DEFAULT_ACCOUNTS = [
  { id: "a1", name: "第1口座（生活費）", color: "#F5A524", budget: 180000, sort: 1 },
  { id: "a2", name: "第2口座（ローン等）", color: "#63C7E8", budget: 0, sort: 2 },
  { id: "a3", name: "第3口座（趣味・娯楽・交際）", color: "#2FB8A6", budget: 60000, sort: 3 },
  { id: "a4", name: "第4口座（投資）", color: "#8B7CF6", budget: 80000, sort: 4 },
  { id: "a5", name: "第5口座（特別支出）", color: "#FF8A7A", budget: 0, sort: 5 },
] as const;

/** 有効な口座idの一覧（各所のバリデーションで共通利用。口座を増減する際はこことDEFAULT_ACCOUNTS、
 * DBのaccountsテーブルの3箇所を揃えて更新する）。 */
export const VALID_ACCOUNT_IDS = DEFAULT_ACCOUNTS.map((a) => a.id);

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

/** Frankfurter（ECB参照レート、APIキー不要）が対応する通貨のうち、旅行先として一般的なもの。
 * 支出入力フォーム（クライアント）と為替レート取得（サーバー）の両方から参照する。 */
export const CURRENCIES: { code: string; label: string }[] = [
  { code: "USD", label: "米ドル" },
  { code: "EUR", label: "ユーロ" },
  { code: "GBP", label: "英ポンド" },
  { code: "KRW", label: "韓国ウォン" },
  { code: "CNY", label: "中国元" },
  { code: "THB", label: "タイバーツ" },
  { code: "SGD", label: "シンガポールドル" },
  { code: "HKD", label: "香港ドル" },
  { code: "AUD", label: "豪ドル" },
  { code: "CAD", label: "カナダドル" },
  { code: "CHF", label: "スイスフラン" },
  { code: "INR", label: "インドルピー" },
  { code: "IDR", label: "インドネシアルピア" },
  { code: "MYR", label: "マレーシアリンギット" },
  { code: "PHP", label: "フィリピンペソ" },
  { code: "NZD", label: "NZドル" },
  { code: "TRY", label: "トルコリラ" },
  { code: "ZAR", label: "南アフリカランド" },
  { code: "MXN", label: "メキシコペソ" },
  { code: "DKK", label: "デンマーククローネ" },
  { code: "NOK", label: "ノルウェークローネ" },
  { code: "SEK", label: "スウェーデンクローナ" },
  { code: "PLN", label: "ポーランドズウォティ" },
  { code: "CZK", label: "チェココルナ" },
  { code: "HUF", label: "ハンガリーフォリント" },
  { code: "ISK", label: "アイスランドクローナ" },
  { code: "ILS", label: "イスラエルシェケル" },
  { code: "BRL", label: "ブラジルレアル" },
  { code: "RON", label: "ルーマニアレウ" },
];
