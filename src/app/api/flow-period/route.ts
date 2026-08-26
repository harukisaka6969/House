import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { isValidMonthKey, nowMonthKeyJST } from "@/lib/date";
import { getFlowPeriod } from "@/lib/flowPeriod";

const VALID_MONTHS = [3, 6, 12];

export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const m = searchParams.get("m") ?? nowMonthKeyJST();
    if (!isValidMonthKey(m)) throw new ApiError(400, "invalid month");
    const months = Number(searchParams.get("months"));
    if (!VALID_MONTHS.includes(months)) throw new ApiError(400, "invalid months");
    const owner = searchParams.get("owner") || undefined;

    return NextResponse.json(await getFlowPeriod(m, months, owner, session.profile_id));
  } catch (e) {
    return errorResponse(e);
  }
}
