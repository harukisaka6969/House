export interface DiscountResult {
  originalPrice: number;
  saving: number;
}

/** 支払金額と割引率から、定価（割引前価格）と節約額を逆算する。
 * 割引率が不正な範囲（0以下・100以上）や金額が不正なら、節約額0として扱う。
 * 100%オフ（無料で入手）はこの方法では表現できない（割引率として100を受け付けないため）。
 * その場合は computeDiscountSavingFromOriginal を使うこと。 */
export function computeDiscountSaving(pricePaid: number, discountPercent: number): DiscountResult {
  if (!Number.isFinite(pricePaid) || pricePaid <= 0 || !Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100) {
    return { originalPrice: Math.max(0, Math.round(pricePaid) || 0), saving: 0 };
  }
  const originalPrice = pricePaid / (1 - discountPercent / 100);
  return { originalPrice: Math.round(originalPrice), saving: Math.round(originalPrice - pricePaid) };
}

/** 定価（元の金額）と実際の支払金額から、節約額を直接計算する。割引率が分からない場合や、
 * ポイント等で全額相殺されて支払額が0円（＝100%オフ、無料で入手）の場合に使う。 */
export function computeDiscountSavingFromOriginal(originalPrice: number, pricePaid: number): DiscountResult {
  if (!Number.isFinite(originalPrice) || originalPrice <= 0 || !Number.isFinite(pricePaid) || pricePaid < 0 || pricePaid > originalPrice) {
    return { originalPrice: Math.max(0, Math.round(originalPrice) || 0), saving: 0 };
  }
  return { originalPrice: Math.round(originalPrice), saving: Math.round(originalPrice - pricePaid) };
}
