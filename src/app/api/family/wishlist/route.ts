import { NextResponse } from "next/server";
import { requireFamilySession, errorResponse } from "@/lib/apiAuth";
import { getAllWishlistItems, toFamilyWishlist } from "@/lib/wishlist";

export async function GET() {
  try {
    await requireFamilySession();
    const rows = await getAllWishlistItems();
    return NextResponse.json({ items: toFamilyWishlist(rows) });
  } catch (e) {
    return errorResponse(e);
  }
}
