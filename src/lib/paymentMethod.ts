/**
 * 支払い方法（何で払ったか）の判定。カード下4桁や決済サービス名から、家庭内での呼び名に揃える。
 * 純粋関数のみなのでテストから直接読める。レシートOCR・LINEの文章・アプリの選択肢で共通に使う。
 */

/** カード下4桁 → 家庭内での呼び名。 */
const CARD_LAST4: Record<string, string> = {
  "6725": "共用カード",
  "6925": "共用カード",
  "0926": "アリサEPOS",
  "1089": "遥希MUFG",
  "2015": "遥希SMBC",
  "1052": "遥希AU",
};

/** 選択肢として出す代表的な支払い方法（アプリのボタン・AIへの候補提示に使う）。 */
export const PAYMENT_METHODS = [
  "共用カード",
  "アリサEPOS",
  "遥希MUFG",
  "遥希SMBC",
  "遥希AU",
  "PayPay",
  "現金",
  "交通系IC",
] as const;

/** 決済サービス名の表記ゆれ → 正式な呼び名。カード以外の支払い手段はここで拾う。 */
const SERVICE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /paypay|ペイペイ|ぺいぺい/i, label: "PayPay" },
  { re: /楽天ペイ|rakuten\s*pay/i, label: "楽天ペイ" },
  { re: /d払い|ｄ払い|docomo\s*pay/i, label: "d払い" },
  { re: /au\s*pay|auペイ/i, label: "au PAY" },
  { re: /メルペイ|merpay/i, label: "メルペイ" },
  { re: /line\s*pay|ラインペイ/i, label: "LINE Pay" },
  { re: /quicpay|クイックペイ/i, label: "QUICPay" },
  { re: /(交通系|suica|スイカ|pasmo|パスモ|icoca)/i, label: "交通系IC" },
  { re: /(現金|cash|お釣り|釣銭)/i, label: "現金" },
  { re: /(apple\s*pay|アップルペイ)/i, label: "Apple Pay" },
  { re: /(amazon\s*(ギフト|gift)|アマギフ)/i, label: "Amazonギフト" },
  { re: /(ギフトカード|gift\s*card|egift)/i, label: "ギフトカード" },
];

export interface PaymentMethodHints {
  /** レシート等から読み取れたカード番号の下4桁。 */
  cardLast4?: string | null;
  /** 「VISA」「クレジット」などのブランド表記。下4桁が不明なときの手掛かりにする。 */
  brand?: string | null;
  /** メッセージ本文やレシートの支払い欄など、判定に使える生テキスト。 */
  rawText?: string | null;
}

/** 文字列からカード下4桁らしき並びを拾う（「****6725」「末尾6725」「XXXX 6725」など）。 */
function findKnownLast4(text: string): string | null {
  // 既知の下4桁が、数字の並びの最後に現れるかを見る（金額の一部を誤検出しないよう区切りを要求）。
  for (const last4 of Object.keys(CARD_LAST4)) {
    const re = new RegExp(`(?:^|[^0-9])(?:[*xX\\u2217\\s-]*)${last4}(?![0-9])`);
    if (re.test(text)) return last4;
  }
  return null;
}

/**
 * 支払い方法を判定する。判定できなければnull（後から手で設定できるようにするため、無理に埋めない）。
 * 既知のカード下4桁を最優先し、次に決済サービス名、最後に未知のカードを「カード(末尾XXXX)」として返す。
 */
export function resolvePaymentMethod(hints: PaymentMethodHints): string | null {
  const raw = (hints.rawText ?? "").normalize("NFKC");
  const last4 = (hints.cardLast4 ?? "").replace(/[^0-9]/g, "").slice(-4);

  if (last4 && CARD_LAST4[last4]) return CARD_LAST4[last4];

  const fromText = findKnownLast4(raw);
  if (fromText) return CARD_LAST4[fromText];

  for (const { re, label } of SERVICE_PATTERNS) {
    if (re.test(raw)) return label;
  }

  const brand = (hints.brand ?? "").normalize("NFKC").trim();
  if (last4) return `カード(末尾${last4})`;
  if (brand) return brand;
  return null;
}
