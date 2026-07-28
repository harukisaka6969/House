import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getPfcTarget, upsertPfcTarget } from "@/lib/mealLog";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const target = await getPfcTarget(session.profile_id);
    return NextResponse.json({ target });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  calories: z.number().min(0).max(20000),
  protein_g: z.number().min(0).max(2000),
  fat_g: z.number().min(0).max(2000),
  carb_g: z.number().min(0).max(4000),
});

export async function PUT(req: Request) {
  try {
    const session = await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const target = await upsertPfcTarget(session.profile_id, input);
    return NextResponse.json({ target });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
