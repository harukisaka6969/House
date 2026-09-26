import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { updateExpensePaidBy } from "@/lib/expenses";
import { getAllProfiles } from "@/lib/profiles";

/** paid_by=nullで立替を解除（その口座から直接支払った通常の状態に戻す）。 */
const bodySchema = z.object({ paid_by: z.string().nullable() });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const { paid_by } = bodySchema.parse(await req.json());
    if (paid_by !== null) {
      const profiles = await getAllProfiles();
      if (!profiles.some((p) => p.id === paid_by && p.role === "owner")) {
        return NextResponse.json({ error: "invalid paid_by" }, { status: 400 });
      }
    }
    const updated = await updateExpensePaidBy([id], session.profile_id, paid_by);
    if (updated === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
