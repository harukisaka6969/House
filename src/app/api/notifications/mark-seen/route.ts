import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { markNotificationSeen } from "@/lib/notifications";

const bodySchema = z.object({ kind: z.enum(["shopping", "meals"]) });

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { kind } = bodySchema.parse(await req.json());
    await markNotificationSeen(session.profile_id, kind);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
