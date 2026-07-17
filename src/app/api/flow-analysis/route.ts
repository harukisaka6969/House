import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getFlowAnalysis } from "@/lib/flowAnalysis";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    return NextResponse.json(await getFlowAnalysis(session.profile_id));
  } catch (e) {
    return errorResponse(e);
  }
}
