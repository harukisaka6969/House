import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { consumeInventoryItem } from "@/lib/inventory";
import { isValidDateStr } from "@/lib/date";

const bodySchema = z.object({ amount: z.number().positive(), date: z.string().optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const { amount, date } = bodySchema.parse(await req.json());
    if (date && !isValidDateStr(date)) throw new ApiError(400, "invalid date");
    const item = await consumeInventoryItem(id, amount, date);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
