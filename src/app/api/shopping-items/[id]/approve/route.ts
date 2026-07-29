import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { approveShoppingItem } from "@/lib/shoppingList";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const item = await approveShoppingItem(id, session.profile_id);
    if (!item) throw new ApiError(400, "自分が追加した項目は承認できません。パートナーの承認を待ってください。");
    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
