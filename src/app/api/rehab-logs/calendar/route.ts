import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getRehabLogDatesInRange } from "@/lib/rehabLog";
import { getJournalEntriesInRange } from "@/lib/journal";
import { findProfileBySlug } from "@/lib/profiles";
import { isValidMonthKey, nowMonthKeyJST } from "@/lib/date";
import { monthRange } from "@/lib/expenses";

/**
 * ハルキが「個人の振り返り」または「日記」を記録した日だけを返す（内容は一切含めない）。
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
    const [rehabDates, journalEntries] = await Promise.all([
      getRehabLogDatesInRange(haruki.id, from, toExclusive),
      getJournalEntriesInRange(haruki.id, from, toExclusive),
    ]);
    const dates = [...new Set([...rehabDates, ...journalEntries.map((e) => e.date)])];
    return NextResponse.json({ dates });
  } catch (e) {
    return errorResponse(e);
  }
}
