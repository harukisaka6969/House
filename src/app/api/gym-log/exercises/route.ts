import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { createExercise } from "@/lib/gymLog";

const bodySchema = z.object({ split_id: z.string(), name: z.string().min(1).max(80), sort: z.number().optional() });

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { split_id, name, sort } = bodySchema.parse(await req.json());
    const exercise = await createExercise(session.profile_id, split_id, name, sort ?? 0);
    return NextResponse.json({ exercise });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
