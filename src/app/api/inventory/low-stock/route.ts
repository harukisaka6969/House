import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getInventoryItems, lowStockItems } from "@/lib/inventory";

export async function GET() {
  try {
    await requireOwnerSession();
    const rows = await getInventoryItems();
    return NextResponse.json({ items: lowStockItems(rows) });
  } catch (e) {
    return errorResponse(e);
  }
}
