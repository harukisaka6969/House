import { NextResponse } from "next/server";
import { requireFamilySession, errorResponse } from "@/lib/apiAuth";
import { getLifeEvents, toFamilyLifeEvents } from "@/lib/lifeEvents";

export async function GET() {
  try {
    await requireFamilySession();
    const rows = await getLifeEvents();
    return NextResponse.json({ events: toFamilyLifeEvents(rows) });
  } catch (e) {
    return errorResponse(e);
  }
}
