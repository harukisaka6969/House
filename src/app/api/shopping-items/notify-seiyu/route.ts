import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { getShoppingItems, setShoppingItemBought } from "@/lib/shoppingList";
import { getAllProfiles, getLineRecipients } from "@/lib/profiles";
import { sendLineMessage } from "@/lib/lineNotify";

/** 西友で買うもの（未購入分）を、ふたり両方のLINEにリストとして送り、送った分は購入済みにする（買い物に出る前の確認＆リストのクリアを兵ねる）。 */
export async function POST() {
  try {
    const session = await requireOwnerSession();
    const recipients = await getLineRecipients();
    if (recipients.length === 0) throw new ApiError(400, "LINE通知が未設定です。「設定」→「LINE通知」でユーザーIDを登録してください。");

    const items = (await getShoppingItems()).filter((i) => i.store === "seiyu" && !i.bought);
    if (items.length === 0) throw new ApiError(400, "西友で買うものは今ありません。");

    const profiles = await getAllProfiles();
    const me = profiles.find((p) => p.id === session.profile_id);
    const lines = [`🛒 西友の買い物リスト（${me?.name ?? "パートナー"}より）`, "", ...items.map((i) => `・${i.name}`)];
    await Promise.all(recipients.map((r) => sendLineMessage(r.line_user_id, lines.join("\n"))));
    await Promise.all(items.map((i) => setShoppingItemBought(i.id, true)));

    return NextResponse.json({ ok: true, count: items.length });
  } catch (e) {
    return errorResponse(e);
  }
}
