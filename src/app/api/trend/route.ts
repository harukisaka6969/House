import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getTrend } from "@/lib/trend";

export async function GET(req: Request) {
  try {
    await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const owner = searchParams.get("owner") || undefined;
    return NextResponse.json({ trend: await getTrend(owner) });
  } catch (e) {
    return errorResponse(e);
  }
}
