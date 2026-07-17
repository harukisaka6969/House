import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { updateWishlistItem, deleteWishlistItem } from "@/lib/wishlist";

const bodySchema = z.object({
  is_private: z.boolean().optional(),
  name: z.string().min(1).max(80).optional(),
  category: z.string().max(40).optional().nullable(),
  price: z.number().nonnegative().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  target_date: z.string().optional().nullable(),
  monthly_plan: z.number().nonnegative().optional(),
  url: z.string().max(500).optional().nullable(),
  memo: z.string().max(500).optional().nullable(),
  visible_to_family: z.boolean().optional(),
  status: z.enum(["planning", "saving", "purchased", "dropped"]).optional(),
  saved: z.number().nonnegative().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const input = bodySchema.parse(await req.json());
    const item = await updateWishlistItem(id, session.profile_id, input);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteWishlistItem(id, session.profile_id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
