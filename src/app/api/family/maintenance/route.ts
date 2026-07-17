import { NextResponse } from "next/server";
import { requireFamilySession, errorResponse } from "@/lib/apiAuth";
import { getAssets, toFamilyAssets } from "@/lib/assets";
import { getMaintenanceTasks, toFamilyMaintenance } from "@/lib/maintenance";

export async function GET() {
  try {
    await requireFamilySession();
    const [assets, tasks] = await Promise.all([getAssets(), getMaintenanceTasks()]);
    const nameOf = new Map(assets.map((a) => [a.id, a.name]));
    return NextResponse.json({
      assets: toFamilyAssets(assets),
      tasks: toFamilyMaintenance(tasks, (id) => nameOf.get(id) ?? "?"),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
