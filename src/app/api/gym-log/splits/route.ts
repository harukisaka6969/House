import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { createSplit } from "@/lib/gymLog";

const bodySchema = z.object({ code: z.string().min(1).max(10), label: z.string().min(1).max(60), sort: z.number().optional() });

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { code, label, sort } = bodySchema.parse(await req.json());
    const split = await createSplit(session.profile_id, code, label, sort ?? 0);
    return NextResponse.json({ split });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
