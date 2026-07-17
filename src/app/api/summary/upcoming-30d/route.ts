import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getTasksDueWithinDays } from "@/lib/maintenance";
import { getAllWishlistItems, visibleWishlistItems } from "@/lib/wishlist";
import { todayStrJST } from "@/lib/date";

const WINDOW_DAYS = 30;

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const [tasks, wishlistRows] = await Promise.all([getTasksDueWithinDays(WINDOW_DAYS), getAllWishlistItems()]);

    const maintenanceCount = tasks.length;
    const maintenanceCost = tasks.reduce((s, t) => s + t.est_cost, 0);

    const today = todayStrJST();
    const [y, m, d] = today.split("-").map(Number);
    const cutoff = new Date(Date.UTC(y, m - 1, d + WINDOW_DAYS)).toISOString().slice(0, 10);

    const visible = visibleWishlistItems(wishlistRows, session.profile_id);
    const dueWishlist = visible.filter((w) => w.status === "saving" && w.target_date && w.target_date >= today && w.target_date <= cutoff);
    const wishlistCount = dueWishlist.length;
    const wishlistMonthlyPlan = dueWishlist.reduce((s, w) => s + w.monthly_plan, 0);

    return NextResponse.json({
      windowDays: WINDOW_DAYS,
      maintenanceCount,
      maintenanceCost,
      wishlistCount,
      wishlistMonthlyPlan,
      total: maintenanceCost + wishlistMonthlyPlan,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
