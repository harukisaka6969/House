import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getRehabLogDatesInRange } from "@/lib/rehabLog";
import { findProfileBySlug } from "@/lib/profiles";
import { isValidMonthKey, nowMonthKeyJST } from "@/lib/date";
import { monthRange } from "@/lib/expenses";

/**
 * ハルキの振り返り記録が「ある日」だけを返す（内容は一切含めない）。
 * カレンダーの印表示用に、アリサも含めどちらのアカウントからでも参照できる。
 */
export async function GET(req: Request) {
  try {
    await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const m = searchParams.get("month") ?? nowMonthKeyJST();
    if (!isValidMonthKey(m)) throw new ApiError(400, "invalid month");

    const haruki = await findProfileBySlug("haruki");
    if (!haruki) return NextResponse.json({ dates: [] });

    const { from, toExclusive } = monthRange(m);
    const dates = await getRehabLogDatesInRange(haruki.id, from, toExclusive);
    return NextResponse.json({ dates });
  } catch (e) {
    return errorResponse(e);
  }
}
