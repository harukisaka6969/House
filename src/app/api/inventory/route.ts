import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getInventoryItemsWithStats, createInventoryItem } from "@/lib/inventory";

export async function GET() {
  try {
    await requireOwnerSession();
    const items = await getInventoryItemsWithStats();
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  name: z.string().min(1).max(60),
  category: z.string().max(40).optional(),
  unit: z.string().max(20).optional(),
  quantity: z.number().int().min(0).optional(),
  low_stock_threshold: z.number().int().min(0).optional(),
  memo: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const item = await createInventoryItem(input);
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
