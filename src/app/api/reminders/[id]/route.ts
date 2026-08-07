import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { updateReminder, deleteReminder } from "@/lib/reminders";

const TIME_RE = /^([01]\d|2[0-3]):(00|15|30|45)$/;

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  recurrence_type: z.enum(["daily", "weekly", "monthly"]).optional(),
  day_of_week: z.number().int().min(0).max(6).optional(),
  day_of_month: z.number().int().min(1).max(31).optional(),
  memo: z.string().max(300).optional(),
  active: z.boolean().optional(),
  done: z.boolean().optional(),
  notify_time: z.string().regex(TIME_RE).nullable().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const patch = patchSchema.parse(await req.json());
    const reminder = await updateReminder(id, patch);
    if (!reminder) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ reminder });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteReminder(id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
