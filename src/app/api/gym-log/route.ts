import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getSplits, getExercises, getRecentLogs } from "@/lib/gymLog";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const [splits, exercises, logs] = await Promise.all([
      getSplits(session.profile_id),
      getExercises(session.profile_id),
      getRecentLogs(session.profile_id),
    ]);
    return NextResponse.json({ splits, exercises, logs });
  } catch (e) {
    return errorResponse(e);
  }
}
