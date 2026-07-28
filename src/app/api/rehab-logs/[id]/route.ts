import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { updateRehabLog, deleteRehabLog } from "@/lib/rehabLog";

function assertHaruki(slug: string) {
  if (slug !== "haruki") throw new ApiError(403, "この機能は利用できません。");
}

const patchSchema = z.object({ data: z.record(z.string(), z.unknown()) });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    assertHaruki(session.slug);
    const { id } = await ctx.params;
    const { data } = patchSchema.parse(await req.json());
    const log = await updateRehabLog(id, session.profile_id, data);
    return NextResponse.json({ log });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    assertHaruki(session.slug);
    const { id } = await ctx.params;
    const ok = await deleteRehabLog(id, session.profile_id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
