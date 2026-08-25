import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getBodyGoal, upsertBodyGoal } from "@/lib/bodyGoals";
import { isValidDateStr } from "@/lib/date";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const goal = await getBodyGoal(session.profile_id);
    return NextResponse.json({ goal });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  body_fat_pct_target: z.number().min(3).max(60).nullable(),
  muscle_trend_kg_per_4w: z.number().min(-5).max(5).nullable(),
  target_weight: z.number().min(20).max(300).nullable().optional(),
  target_lbm: z.number().min(10).max(200).nullable().optional(),
  target_date: z.string().refine(isValidDateStr).nullable().optional(),
});

export async function PUT(req: Request) {
  try {
    const session = await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const goal = await upsertBodyGoal(session.profile_id, input);
    return NextResponse.json({ goal });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
