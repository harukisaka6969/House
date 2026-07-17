import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { contributeWishlistItem } from "@/lib/wishlist";
import { getAllCategories } from "@/lib/categories";

const VALID_ACCOUNTS = ["a1", "a2", "a3", "a4"];

const bodySchema = z.object({
  amount: z.number().positive(),
  createExpense: z.boolean().optional(),
  account: z.string().optional(),
  category: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json());

    if (body.createExpense) {
      if (!body.account || !VALID_ACCOUNTS.includes(body.account)) throw new ApiError(400, "invalid account");
      const allCats = await getAllCategories();
      if (!body.category || !allCats.includes(body.category)) throw new ApiError(400, "invalid category");
    }

    const saved = await contributeWishlistItem(id, session.profile_id, body);
    return NextResponse.json({ saved });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
