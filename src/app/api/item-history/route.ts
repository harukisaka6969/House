import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { searchItemHistory } from "@/lib/itemHistory";
import { getAllProfiles, findPartnerOwner, makeNameLookup } from "@/lib/profiles";

/** 品目名（購入品・食事内容）をキーワード検索する。デフォルトは自分＋パートナー分（家計・食事は家族で
 * 共有する前提のため）、ownerクエリを指定すればどちらか一方に絞れる。 */
export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const owner = searchParams.get("owner");
    if (!q) return NextResponse.json({ items: [] });

    const profiles = await getAllProfiles();
    const partner = findPartnerOwner(profiles, session.profile_id);
    const nameOf = makeNameLookup(profiles);
    const ownerIds = owner ? [owner] : partner ? [session.profile_id, partner.id] : [session.profile_id];

    const rows = await searchItemHistory(ownerIds, q);
    const items = rows.map((r) => ({
      id: r.id,
      owner: r.owner,
      owner_name: nameOf(r.owner),
      date: r.date,
      name: r.name,
      source: r.source,
      note: r.note,
    }));
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}
