import { NextResponse } from "next/server";
import { requireSession, errorResponse } from "@/lib/apiAuth";
import { deleteInvestment } from "@/lib/investments";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const ok = await deleteInvestment(id, session.profile_id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
