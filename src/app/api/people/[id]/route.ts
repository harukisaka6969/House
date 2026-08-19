import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { deletePerson } from "@/lib/people";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deletePerson(id);
    if (!ok) throw new ApiError(404, "見つかりません");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
