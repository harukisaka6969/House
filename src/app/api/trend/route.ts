import { NextResponse } from "next/server";
import { requireSession, errorResponse } from "@/lib/apiAuth";
import { getTrend } from "@/lib/trend";

export async function GET() {
  try {
    await requireSession();
    return NextResponse.json({ trend: await getTrend() });
  } catch (e) {
    return errorResponse(e);
  }
}
