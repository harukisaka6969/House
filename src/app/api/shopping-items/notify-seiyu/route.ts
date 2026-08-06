import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getShoppingItems } from "@/lib/shoppingList";
import { getLineUserId } from "@/lib/profiles";
import { sendLineMessage } from "@/lib/lineNotify";

/** 西友で買うもの（未購入分）を、自分のLINEにリストとして送る。買い物に出る前の確認用。 */
export async function POST() {
  try {
    const session = await requireOwnerSession();
    const myLineId = await getLineUserId(session.profile_id);
    if (!myLineId) throw new ApiError(400, "LINE通知が未設定です。「設定」→「LINE通知」でユーザーIDを登録してください。");

    const items = (await getShoppingItems()).filter((i) => i.store === "seiyu" && !i.bought);
    if (items.length === 0) throw new ApiError(400, "西友で買うものは今ありません。");

    const lines = ["🛒 西友の買い物リスト", "", ...items.map((i) => `・${i.name}`)];
    await sendLineMessage(myLineId, lines.join("\n"));

    return NextResponse.json({ ok: true, count: items.length });
  } catch (e) {
    return errorResponse(e);
  }
}
