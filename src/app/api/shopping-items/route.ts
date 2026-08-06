import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getShoppingItems, createShoppingItem, ValidationError } from "@/lib/shoppingList";
import { getAllProfiles, makeNameLookup, findPartnerOwner, getLineUserId } from "@/lib/profiles";
import { sendLineMessage } from "@/lib/lineNotify";

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

    if (item.needs_approval) {
      try {
        const profiles = await getAllProfiles();
        const me = profiles.find((p) => p.id === session.profile_id);
        const partner = findPartnerOwner(profiles, session.profile_id);
        const partnerLineId = partner ? await getLineUserId(partner.id) : null;
        if (partnerLineId) {
          await sendLineMessage(
            partnerLineId,
            `🛒 ${me?.name ?? "パートナー"}が「${item.name}」を買いたいみたい。承認してあげてね！\nLINEで承認したければ「承認」と送ってね。`
          );
        }
      } catch (e) {
        console.error("shopping approval LINE notify failed", e);
      }
    }

    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
