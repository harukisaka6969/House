import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { contributeLifeEvent } from "@/lib/lifeEvents";

const bodySchema = z.object({ amount: z.number().positive() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const { amount } = bodySchema.parse(await req.json());
    const funded = await contributeLifeEvent(id, amount);
    return NextResponse.json({ funded });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
