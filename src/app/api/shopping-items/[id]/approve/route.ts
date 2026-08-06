import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { approveShoppingItem } from "@/lib/shoppingList";
import { getAllProfiles, getLineUserId } from "@/lib/profiles";
import { sendLineMessage } from "@/lib/lineNotify";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const item = await approveShoppingItem(id, session.profile_id);
    if (!item) throw new ApiError(400, "自分が追加した項目は承認できません。パートナーの承認を待ってください。");

    try {
      const profiles = await getAllProfiles();
      const approver = profiles.find((p) => p.id === session.profile_id);
      const requesterLineId = await getLineUserId(item.owner);
      if (requesterLineId) {
        await sendLineMessage(requesterLineId, `✅ ${approver?.name ?? "パートナー"}が「${item.name}」を承認したよ！`);
      }
    } catch (e) {
      console.error("shopping approve LINE notify failed", e);
    }

    return NextResponse.json({ item });
  } catch (e) {
    return errorResponse(e);
  }
}
