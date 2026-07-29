import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getShoppingItems, createShoppingItem, ValidationError } from "@/lib/shoppingList";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";

export async function GET() {
  try {
    await requireOwnerSession();
    const [items, profiles] = await Promise.all([getShoppingItems(), getAllProfiles()]);
    const nameOf = makeNameLookup(profiles);
    return NextResponse.json({
      items: items.map((i) => ({
        id: i.id,
        owner: i.owner,
        owner_name: nameOf(i.owner),
        name: i.name,
        store: i.store,
        needs_approval: i.needs_approval,
        approved: i.approved,
        approved_by_name: i.approved_by ? nameOf(i.approved_by) : null,
        bought: i.bought,
        created_at: i.created_at,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  store: z.enum(["seiyu", "amazon", "conveni", "other"]),
});

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const item = await createShoppingItem(session.profile_id, input);
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
