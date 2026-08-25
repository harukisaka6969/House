import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { deleteMealPrep } from "@/lib/mealPreps";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteMealPrep(id, session.profile_id);
    if (!ok) throw new ApiError(404, "見つかりません");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
