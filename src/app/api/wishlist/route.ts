import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getAllWishlistItems, visibleWishlistItems, createWishlistItem } from "@/lib/wishlist";
import { getWishlistCommentsForItems } from "@/lib/wishlistComments";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";

export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const owner = searchParams.get("owner") || undefined;
    const [rows, profiles] = await Promise.all([getAllWishlistItems(), getAllProfiles()]);
    const nameOf = makeNameLookup(profiles);
    const visible = visibleWishlistItems(rows, session.profile_id);
    const scoped = owner ? visible.filter((r) => r.owner === owner) : visible;
    const comments = await getWishlistCommentsForItems(scoped.map((r) => r.id));
    const items = scoped.map((r) => ({
      ...r,
      owner_name: nameOf(r.owner),
      comments: comments.filter((c) => c.item_id === r.id).map((c) => ({ id: c.id, owner: c.owner, owner_name: nameOf(c.owner), body: c.body, created_at: c.created_at })),
    }));
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  is_private: z.boolean().optional(),
  name: z.string().min(1).max(80),
  category: z.string().max(40).optional().nullable(),
  price: z.number().nonnegative(),
  priority: z.number().int().min(0).max(5).optional(),
  target_date: z.string().optional().nullable(),
  monthly_plan: z.number().nonnegative().optional(),
  url: z.string().max(500).optional().nullable(),
  memo: z.string().max(500).optional().nullable(),
  visible_to_family: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const item = await createWishlistItem(session.profile_id, input);
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
