import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { updateAsset, deleteAsset } from "@/lib/assets";

const bodySchema = z.object({
  name: z.string().min(1).max(60).optional(),
  kind: z.enum(["car", "house", "appliance", "other"]).optional(),
  acquired_date: z.string().optional().nullable(),
  memo: z.string().max(500).optional().nullable(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const input = bodySchema.parse(await req.json());
    const asset = await updateAsset(id, input);
    if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ asset });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteAsset(id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
