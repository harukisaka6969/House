import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getAssets } from "@/lib/assets";
import { getMaintenanceTasks, getUpcomingTasks, getRecentLogsWithAsset } from "@/lib/maintenance";
import { todayStrJST, periodKeyOfDate } from "@/lib/date";

export async function GET(req: Request) {
  try {
    await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const months = Math.min(Math.max(Number(searchParams.get("months")) || 12, 1), 36);

    const today = todayStrJST();
    const sinceLastYear = (() => {
      const [y, m, d] = today.split("-").map(Number);
      return new Date(Date.UTC(y - 1, m - 1, d)).toISOString().slice(0, 10);
    })();

    const [assets, allTasks, upcomingTasks, recentLogs] = await Promise.all([
      getAssets(),
      getMaintenanceTasks(),
      getUpcomingTasks(months),
      getRecentLogsWithAsset(sinceLastYear),
    ]);

    const assetNameOf = new Map(assets.map((a) => [a.id, a.name]));
    const withName = (t: (typeof allTasks)[number]) => ({ ...t, asset_name: assetNameOf.get(t.asset_id) ?? "?" });

    const monthlyMap = new Map<string, number>();
    for (const t of upcomingTasks) {
      const key = periodKeyOfDate(t.next_due);
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + t.est_cost);
    }
    const monthly = [...monthlyMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, cost]) => ({ month, cost }));
    const totalCost = upcomingTasks.reduce((s, t) => s + t.est_cost, 0);

    return NextResponse.json({
      assets,
      allTasks: allTasks.map(withName),
      upcoming: upcomingTasks.map(withName),
      recentLogs,
      monthly,
      totalCost,
      windowMonths: months,
      today,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
