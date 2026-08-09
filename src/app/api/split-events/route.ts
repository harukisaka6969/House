import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { createSplitEvent, getSplitEventsForOwner } from "@/lib/splitEvents";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const events = await getSplitEventsForOwner(session.profile_id);
    return NextResponse.json({ events });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({ name: z.string().min(1).max(80) });

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { name } = bodySchema.parse(await req.json());
    const event = await createSplitEvent(session.profile_id, name);
    return NextResponse.json({ event });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
