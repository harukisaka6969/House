import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getTrend } from "@/lib/trend";

export async function GET() {
  try {
    await requireOwnerSession();
    return NextResponse.json({ trend: await getTrend() });
  } catch (e) {
    return errorResponse(e);
  }
}
