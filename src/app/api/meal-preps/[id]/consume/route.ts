import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { consumeMealPrep, MealPrepError } from "@/lib/mealPreps";
import { businessDateJST, isValidDateStr } from "@/lib/date";

const bodySchema = z.object({ grams: z.number().positive(), date: z.string().refine(isValidDateStr).optional() });

/** 作り置きから指定グラム食べた分を、その日の食事ログとして記録し、残量を減らす。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const { grams, date } = bodySchema.parse(await req.json());
    const { log, prep } = await consumeMealPrep(id, session.profile_id, grams, date ?? businessDateJST());
    return NextResponse.json({ log, prep });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof MealPrepError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
