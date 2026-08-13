import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { fetchJpyRate, isPlausibleCurrencyCode } from "@/lib/currency";

/** 1単位の外貨が何円かを返す（支出入力フォームでの円換算プレビュー用）。固定の対応通貨リストは持たず、
 * レートAPIへの問い合わせ結果で対応可否を都度判定する（新しい通貨コードにも自動対応）。 */
export async function GET(req: Request) {
  try {
    await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const currency = (searchParams.get("currency") || "").trim().toUpperCase();
    if (currency !== "JPY" && !isPlausibleCurrencyCode(currency)) {
      return NextResponse.json({ error: "対応していない通貨です" }, { status: 400 });
    }
    const rate = await fetchJpyRate(currency);
    return NextResponse.json({ currency, rate });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("unsupported currency")) {
      return NextResponse.json({ error: "対応していない通貨です" }, { status: 400 });
    }
    return errorResponse(e);
  }
}
