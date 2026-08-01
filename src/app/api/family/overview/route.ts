import { NextResponse } from "next/server";
import { requireFamilySession, errorResponse } from "@/lib/apiAuth";
import { getAllWishlistItems, toFamilyWishlist } from "@/lib/wishlist";
import { getLifeEvents, toFamilyLifeEvents } from "@/lib/lifeEvents";
import { getAssets, toFamilyAssets } from "@/lib/assets";
import { getMaintenanceTasks, toFamilyMaintenance } from "@/lib/maintenance";
import { nowMonthKeyJST, shiftMonth, periodKeyOfDate } from "@/lib/date";

const WINDOW_MONTHS = 18;

interface TimelineItem {
  type: "maintenance" | "wishlist" | "life_event";
  id: string;
  name: string;
  cost: number;
}

export async function GET() {
  try {
    await requireFamilySession();
    const [wishlistRows, lifeEventRows, assets, taskRows] = await Promise.all([
      getAllWishlistItems(),
      getLifeEvents(),
      getAssets(),
      getMaintenanceTasks(),
    ]);
    const assetNameOf = new Map(assets.map((a) => [a.id, a.name]));

    const wishlist = toFamilyWishlist(wishlistRows);
    const lifeEvents = toFamilyLifeEvents(lifeEventRows);
    const maintenance = toFamilyMaintenance(taskRows, (id) => assetNameOf.get(id) ?? "?");

    const months: string[] = [];
    let cursor = nowMonthKeyJST();
    for (let i = 0; i < WINDOW_MONTHS; i++) {
      months.push(cursor);
      cursor = shiftMonth(cursor, 1);
    }
    const monthSet = new Set(months);

    const buckets = new Map<string, TimelineItem[]>();
    for (const m of months) buckets.set(m, []);

    for (const t of maintenance) {
      const m = periodKeyOfDate(t.next_due);
      if (monthSet.has(m)) buckets.get(m)!.push({ type: "maintenance", id: t.id, name: `${t.asset_name}: ${t.name}`, cost: t.est_cost });
    }
    for (const w of wishlist) {
      if (!w.target_date) continue;
      const m = periodKeyOfDate(w.target_date);
      if (monthSet.has(m)) buckets.get(m)!.push({ type: "wishlist", id: w.id, name: w.name, cost: w.price });
    }
    for (const ev of lifeEvents) {
      const m = `${ev.event_year}-${String(ev.event_month ?? 1).padStart(2, "0")}`;
      if (monthSet.has(m)) buckets.get(m)!.push({ type: "life_event", id: ev.id, name: ev.name, cost: Math.round((ev.cost_low + ev.cost_high) / 2) });
    }

    const timeline = months.map((month) => {
      const items = buckets.get(month)!;
      return { month, items, subtotal: items.reduce((s, it) => s + it.cost, 0) };
    });

    return NextResponse.json({ timeline, wishlist, lifeEvents, maintenance, assets: toFamilyAssets(assets) });
  } catch (e) {
    return errorResponse(e);
  }
}
