import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { updateIdeaNote, deleteIdeaNote } from "@/lib/ideaNotes";

const patchSchema = z.object({
  content: z.string().max(4000).optional(),
  color: z.enum(["yellow", "blue", "green", "pink", "purple"]).optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const patch = patchSchema.parse(await req.json());
    const note = await updateIdeaNote(id, session.profile_id, patch);
    if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ note });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteIdeaNote(id, session.profile_id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
