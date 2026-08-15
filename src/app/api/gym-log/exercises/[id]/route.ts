import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { deleteExercise, updateExercise } from "@/lib/gymLog";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteExercise(id, session.profile_id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

const patchSchema = z.object({ sort: z.number().optional(), active: z.boolean().optional() });

/** 種目の並び順変更・一時的な表示/非表示切り替え用。 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const patch = patchSchema.parse(await req.json());
    const exercise = await updateExercise(id, session.profile_id, patch);
    if (!exercise) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ exercise });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
