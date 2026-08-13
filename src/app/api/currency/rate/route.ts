import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { fetchJpyRate, isSupportedCurrency } from "@/lib/currency";

/** 1単位の外貨が何円かを返す（支出入力フォームでの円換算プレビュー用）。 */
export async function GET(req: Request) {
  try {
    await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const currency = (searchParams.get("currency") || "").toUpperCase();
    if (!isSupportedCurrency(currency)) {
      return NextResponse.json({ error: "対応していない通貨です" }, { status: 400 });
    }
    const rate = await fetchJpyRate(currency);
    return NextResponse.json({ currency, rate });
  } catch (e) {
    return errorResponse(e);
  }
}
