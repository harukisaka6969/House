import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { deleteAlias } from "@/lib/people";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; aliasId: string }> }) {
  try {
    await requireOwnerSession();
    const { id, aliasId } = await ctx.params;
    const ok = await deleteAlias(id, aliasId);
    if (!ok) throw new ApiError(404, "見つかりません");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
