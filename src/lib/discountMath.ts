export interface DiscountResult {
  originalPrice: number;
  saving: number;
}

/** 支払金額と割引率から、定価（割引前価格）と節約額を逆算する。
 * 割引率が不正な範囲（0以下・100以上）や金額が不正なら、節約額0として扱う。 */
export function computeDiscountSaving(pricePaid: number, discountPercent: number): DiscountResult {
  if (!Number.isFinite(pricePaid) || pricePaid <= 0 || !Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100) {
    return { originalPrice: Math.max(0, Math.round(pricePaid) || 0), saving: 0 };
  }
  const originalPrice = pricePaid / (1 - discountPercent / 100);
  return { originalPrice: Math.round(originalPrice), saving: Math.round(originalPrice - pricePaid) };
}
