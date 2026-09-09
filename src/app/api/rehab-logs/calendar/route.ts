import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getRehabLogDatesInRange } from "@/lib/rehabLog";
import { getJournalEntriesInRange } from "@/lib/journal";
import { findProfileBySlug } from "@/lib/profiles";
import { isValidMonthKey, nowMonthKeyJST } from "@/lib/date";
import { monthRange } from "@/lib/expenses";

/**
 * ハルキが「個人の振り返り」または「日記」を記録した日だけを返す（内容は一切含めない）。
 * 日記はAIの自動下書きを一切編集せず保存しただけの日（ai_generated=true）は対象外 — 実際に
 * 自分で書いた日だけを印にするため。カレンダーの印表示用に、アリサも含めどちらのアカウントからでも参照できる。
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
    const dates = [...new Set([...rehabDates, ...journalEntries.filter((e) => !e.ai_generated).map((e) => e.date)])];
    return NextResponse.json({ dates });
  } catch (e) {
    return errorResponse(e);
  }
}
