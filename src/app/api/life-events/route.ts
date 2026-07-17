import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getLifeEvents, createLifeEvent } from "@/lib/lifeEvents";

export async function GET() {
  try {
    await requireOwnerSession();
    const events = await getLifeEvents();
    return NextResponse.json({ events });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  name: z.string().min(1).max(80),
  event_year: z.number().int().min(1900).max(2200),
  event_month: z.number().int().min(1).max(12).optional().nullable(),
  cost_low: z.number().nonnegative(),
  cost_high: z.number().nonnegative(),
  cost_basis: z.string().max(200).optional().nullable(),
  monthly_saving: z.number().nonnegative().optional(),
  linked: z.boolean().optional(),
  memo: z.string().max(500).optional().nullable(),
  visible_to_family: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const event = await createLifeEvent(input);
    return NextResponse.json({ event });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
