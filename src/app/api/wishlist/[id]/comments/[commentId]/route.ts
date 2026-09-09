import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { deleteWishlistComment } from "@/lib/wishlistComments";

/** 自分が書いたコメントのみ削除できる。 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; commentId: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { commentId } = await ctx.params;
    const ok = await deleteWishlistComment(commentId, session.profile_id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
