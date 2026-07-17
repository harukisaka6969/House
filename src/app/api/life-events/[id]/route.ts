import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { updateLifeEvent, deleteLifeEvent } from "@/lib/lifeEvents";

const bodySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  event_year: z.number().int().min(1900).max(2200).optional(),
  event_month: z.number().int().min(1).max(12).optional().nullable(),
  cost_low: z.number().nonnegative().optional(),
  cost_high: z.number().nonnegative().optional(),
  cost_basis: z.string().max(200).optional().nullable(),
  monthly_saving: z.number().nonnegative().optional(),
  linked: z.boolean().optional(),
  memo: z.string().max(500).optional().nullable(),
  visible_to_family: z.boolean().optional(),
  status: z.enum(["active", "done", "cancelled"]).optional(),
  funded: z.number().nonnegative().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const input = bodySchema.parse(await req.json());
    const event = await updateLifeEvent(id, input);
    if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ event });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteLifeEvent(id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
