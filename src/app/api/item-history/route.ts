import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import {
  searchItemHistory,
  listItemHistoryForDay,
  periodTotalsFromExpenseIds,
  periodTotalsFromItemRows,
} from "@/lib/itemHistory";
import { getAllProfiles, findPartnerOwner, makeNameLookup } from "@/lib/profiles";
import type { ItemHistorySource, ItemHistoryRow } from "@/lib/types";

function toOut(r: ItemHistoryRow, nameOf: (id: string) => string) {
  return {
    id: r.id,
    owner: r.owner,
    owner_name: nameOf(r.owner),
    date: r.date,
    name: r.name,
    source: r.source,
    store: r.store,
    category: r.category,
    amount: r.amount,
  };
}

/** 品目名・店名・カテゴリのいずれかで検索する（デフォルトは自分＋パートナー分。家計・食事は家族で
 * 共有する前提のため）。qを指定すると検索モード（該当行＋集計）、dateを指定すると日別の全件モード
 * （検索結果の「その日をタップして展開」用、キーワードでは絞らない）で返す。 */
export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const owner = searchParams.get("owner");
    const sourceParam = searchParams.get("source");
    if (sourceParam !== "purchase" && sourceParam !== "meal") throw new ApiError(400, "sourceを指定してください（purchase または meal）。");
    const source: ItemHistorySource = sourceParam;

    const profiles = await getAllProfiles();
    const partner = findPartnerOwner(profiles, session.profile_id);
    const nameOf = makeNameLookup(profiles);
    const ownerIds = owner ? [owner] : partner ? [session.profile_id, partner.id] : [session.profile_id];

    const date = searchParams.get("date");
    if (date) {
      const rows = await listItemHistoryForDay(ownerIds, date, source);
      return NextResponse.json({ items: rows.map((r) => toOut(r, nameOf)) });
    }

    const q = searchParams.get("q")?.trim() ?? "";
    if (!q) return NextResponse.json({ items: [], aggregates: null });

    const rows = await searchItemHistory(ownerIds, q, source);
    const lowerQ = q.toLowerCase();

    let aggregates = null;
    if (source === "purchase") {
      const itemMatches = rows.filter((r) => r.name.toLowerCase().includes(lowerQ));
      const storeMatches = rows.filter((r) => r.store.toLowerCase().includes(lowerQ));
      const categoryMatches = rows.filter((r) => r.category.toLowerCase().includes(lowerQ));

      const byItem = itemMatches.length > 0 ? { query: q, ...periodTotalsFromItemRows(itemMatches) } : null;
      const byStore =
        storeMatches.length > 0
          ? { query: q, totals: await periodTotalsFromExpenseIds(storeMatches.map((r) => r.expense_id).filter((id): id is string => !!id)) }
          : null;
      const byCategory =
        categoryMatches.length > 0
          ? { query: q, totals: await periodTotalsFromExpenseIds(categoryMatches.map((r) => r.expense_id).filter((id): id is string => !!id)) }
          : null;

      if (byItem || byStore || byCategory) {
        aggregates = {
          byItem: byItem ? { query: byItem.query, totals: byItem.totals, unknownCount: byItem.unknownCount } : null,
          byStore,
          byCategory,
        };
      }
    }

    return NextResponse.json({ items: rows.map((r) => toOut(r, nameOf)), aggregates });
  } catch (e) {
    return errorResponse(e);
  }
}
