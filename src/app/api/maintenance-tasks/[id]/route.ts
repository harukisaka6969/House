import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { updateMaintenanceTask, deleteMaintenanceTask } from "@/lib/maintenance";

const bodySchema = z.object({
  asset_id: z.string().uuid().optional(),
  name: z.string().min(1).max(60).optional(),
  interval_months: z.number().int().positive().nullable().optional(),
  est_cost: z.number().nonnegative().optional(),
  next_due: z.string().optional(),
  memo: z.string().max(500).optional().nullable(),
  visible_to_family: z.boolean().optional(),
  active: z.boolean().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const input = bodySchema.parse(await req.json());
    const task = await updateMaintenanceTask(id, input);
    if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteMaintenanceTask(id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
