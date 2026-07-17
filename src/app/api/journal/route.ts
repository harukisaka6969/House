import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getJournalEntriesInRange, getSportLogsInRange } from "@/lib/journal";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";
import { isValidMonthKey, nowMonthKeyJST } from "@/lib/date";
import { monthRange } from "@/lib/expenses";

export async function GET(req: Request) {
  try {
    await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const m = searchParams.get("month") ?? nowMonthKeyJST();
    if (!isValidMonthKey(m)) throw new ApiError(400, "invalid month");

    const { from, toExclusive } = monthRange(m);
    const [entryRows, logRows, profiles] = await Promise.all([
      getJournalEntriesInRange(from, toExclusive),
      getSportLogsInRange(from, toExclusive),
      getAllProfiles(),
    ]);
    const nameOf = makeNameLookup(profiles);

    return NextResponse.json({
      month: m,
      entries: entryRows.map((e) => ({ ...e, owner_name: nameOf(e.owner) })),
      sportLogs: logRows.map((l) => ({ ...l, owner_name: nameOf(l.owner) })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
