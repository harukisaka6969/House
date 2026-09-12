import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { deleteLog, updateLog } from "@/lib/gymLog";

const setSchema = z.object({ weight: z.number().min(0), reps: z.number().int().min(0) });
const bodySchema = z.object({
  sets: z.array(setSchema).max(20).optional(),
  duration_minutes: z.number().min(0).max(1000).nullable().optional(),
  distance_km: z.number().min(0).max(500).nullable().optional(),
  note: z.string().max(500).optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const { sets, duration_minutes, distance_km, note } = bodySchema.parse(await req.json());
    const log = await updateLog(id, session.profile_id, {
      sets,
      durationMinutes: duration_minutes,
      distanceKm: distance_km,
      note,
    });
    if (!log) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ log });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteLog(id, session.profile_id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
