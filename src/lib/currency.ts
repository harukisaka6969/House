import "server-only";
import { CURRENCIES } from "./constants";

const CODES = new Set(CURRENCIES.map((c) => c.code));

export function isSupportedCurrency(code: string): boolean {
  return CODES.has(code);
}

/** 1単位のcurrencyが何円かを取得する（Frankfurter API、ECB参照レート・キー不要）。 */
export async function fetchJpyRate(currency: string): Promise<number> {
  if (currency === "JPY") return 1;
  if (!isSupportedCurrency(currency)) throw new Error(`unsupported currency: ${currency}`);
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=JPY`, { cache: "no-store" });
  if (!res.ok) throw new Error("為替レートの取得に失敗しました");
  const data = (await res.json()) as { rates?: { JPY?: number } };
  const rate = data.rates?.JPY;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("為替レートの取得に失敗しました");
  }
  return rate;
}
