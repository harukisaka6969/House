import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { createSportLog } from "@/lib/journal";

const bodySchema = z.object({
  date: z.string(),
  activity: z.string().min(1).max(60),
  duration_minutes: z.number().int().positive().optional().nullable(),
  distance_km: z.number().positive().optional().nullable(),
  memo: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const log = await createSportLog(session.profile_id, input);
    return NextResponse.json({ log });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
