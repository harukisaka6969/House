import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getYearTimeline } from "@/lib/yearTimeline";
import { todayStrJST } from "@/lib/date";

export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const yearParam = Number(searchParams.get("year"));
    const year = Number.isInteger(yearParam) && yearParam > 0 ? yearParam : Number(todayStrJST().slice(0, 4));
    const result = await getYearTimeline(year, session.profile_id);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
