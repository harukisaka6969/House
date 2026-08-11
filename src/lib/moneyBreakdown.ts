/** 「今日の支出」スワイプ画面用: 金額をお札・コインの額面に貪欲法で分解する。DB/AI依存なしでテストできる。 */

export const DENOMINATIONS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1] as const;
const BILL_THRESHOLD = 1000;

export interface DenominationCount {
  value: number;
  count: number;
  kind: "bill" | "coin";
}

/** 大きい額面から貪欲に分解する。合計が0以下ならは空配列。分解結果の総和は必ず元の金額と一致する
 * （呼び出し側で検算できるよう assertBreakdownSum も提供する）。 */
export function breakdownYen(total: number): DenominationCount[] {
  let remaining = Math.max(0, Math.round(total));
  const result: DenominationCount[] = [];
  for (const value of DENOMINATIONS) {
    const count = Math.floor(remaining / value);
    if (count > 0) {
      result.push({ value, count, kind: value >= BILL_THRESHOLD ? "bill" : "coin" });
      remaining -= count * value;
    }
  }
  assertBreakdownSum(result, total);
  return result;
}

export class BreakdownAssertionError extends Error {}

/** 分解した額面×枚数の総和が元の金額と一致するかを検算する。 */
export function assertBreakdownSum(breakdown: DenominationCount[], total: number): void {
  const sum = breakdown.reduce((s, d) => s + d.value * d.count, 0);
  const expected = Math.max(0, Math.round(total));
  if (sum !== expected) {
    throw new BreakdownAssertionError(`breakdown sum mismatch: got ${sum}, expected ${expected}`);
  }
}
