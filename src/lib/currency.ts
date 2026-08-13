import "server-only";

const CODE_RE = /^[A-Z]{3}$/;

/** 3文字のISO 4217コードの形式かどうかだけを軽く見る。実際にその通貨に対応しているかはfetchJpyRateが
 * 為替レートAPIへの問い合わせ結果で都度判定する（固定の通貨一覧を持たないため、新しい通貨コードでも
 * レートさえ取得できれば自動的に対応できる）。 */
export function isPlausibleCurrencyCode(code: string): boolean {
  return CODE_RE.test((code || "").trim().toUpperCase());
}

/** 1単位のcurrencyが何円かを取得する。open.er-api.com（無料・APIキー不要、世界の主要通貨160種以上に対応）を
 * 使い、対応していない通貨コードならエラーを投げる。事前に固定リストで弾かず常に実際のAPI応答で判定するため、
 * 新しい通貨での支出も、そのつどレートが取得できる限り自動的に登録できる。 */
export async function fetchJpyRate(currency: string): Promise<number> {
  const code = (currency || "").trim().toUpperCase();
  if (code === "JPY") return 1;
  if (!CODE_RE.test(code)) throw new Error(`unsupported currency: ${currency}`);
  const res = await fetch(`https://open.er-api.com/v6/latest/${code}`, { cache: "no-store" });
  if (!res.ok) throw new Error("為替レートの取得に失敗しました");
  const data = (await res.json()) as { result?: string; rates?: { JPY?: number } };
  if (data.result !== "success") throw new Error(`unsupported currency: ${currency}`);
  const rate = data.rates?.JPY;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("為替レートの取得に失敗しました");
  }
  return rate;
}
