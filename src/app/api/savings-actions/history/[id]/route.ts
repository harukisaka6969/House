import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { deleteSavingsHistoryEntry } from "@/lib/savingsActions";

/** 節約履歴の1件削除。action_id（紐づくカードのid。単独記録ならnull/省略）はクエリパラメータで渡す。 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const actionId = searchParams.get("action_id") || null;
    const ok = await deleteSavingsHistoryEntry(id, actionId);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
