import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { restockInventoryItem } from "@/lib/inventory";
import { getAllCategories } from "@/lib/categories";
import { VALID_ACCOUNT_IDS as VALID_ACCOUNTS } from "@/lib/constants";
import { isValidDateStr } from "@/lib/date";

const bodySchema = z.object({
  amount: z.number().int().positive(),
  createExpense: z.boolean().optional(),
  account: z.string().optional(),
  category: z.string().optional(),
  price: z.number().nonnegative().optional(),
  date: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json());
    if (body.date && !isValidDateStr(body.date)) throw new ApiError(400, "invalid date");

    if (body.createExpense) {
      if (!body.account || !(VALID_ACCOUNTS as readonly string[]).includes(body.account)) throw new ApiError(400, "invalid account");
      const allCats = await getAllCategories();
      if (!body.category || !allCats.includes(body.category)) throw new ApiError(400, "invalid category");
      if (!body.price) throw new ApiError(400, "price is required when createExpense is true");
    }

    const quantity = await restockInventoryItem(id, session.profile_id, body);
    return NextResponse.json({ quantity });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
