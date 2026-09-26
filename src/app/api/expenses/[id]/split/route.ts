import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { updateExpenseSplit, ValidationError } from "@/lib/expenses";

/** num=nullで割り勘を解除（立て替えた全額に戻す）。 */
const bodySchema = z.object({
  num: z.number().int().min(1).max(99).nullable(),
  den: z.number().int().min(1).max(99).optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const { num, den } = bodySchema.parse(await req.json());
    if (num !== null && (den === undefined || num > den)) {
      return NextResponse.json({ error: "invalid split" }, { status: 400 });
    }
    const expense = await updateExpenseSplit(id, session.profile_id, num === null ? null : { num, den: den! });
    if (!expense) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ expense });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
