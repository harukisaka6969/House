import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { updateExpenseOwner } from "@/lib/expenses";
import { getAllProfiles } from "@/lib/profiles";

const bodySchema = z.object({ owner: z.string().nullable() });

/** 支出の「誰の支出か」を入力後に付け替える。ownerはハルキ・アリサいずれかのprofile idか、
 * 「2人の支出（共通）」を表すnull。 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const { owner } = bodySchema.parse(await req.json());
    if (owner !== null) {
      const profiles = await getAllProfiles();
      if (!profiles.some((p) => p.id === owner && p.role === "owner")) {
        return NextResponse.json({ error: "invalid owner" }, { status: 400 });
      }
    }
    const expense = await updateExpenseOwner(id, session.profile_id, owner);
    if (!expense) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ expense });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
