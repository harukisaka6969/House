import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getFlowAnalysis } from "@/lib/flowAnalysis";

export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const owner = searchParams.get("owner") || undefined;
    return NextResponse.json(await getFlowAnalysis(session.profile_id, owner));
  } catch (e) {
    return errorResponse(e);
  }
}
