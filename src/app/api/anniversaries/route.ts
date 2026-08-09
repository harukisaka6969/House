import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getAnniversaries, createAnniversary } from "@/lib/anniversaries";

export async function GET() {
  try {
    await requireOwnerSession();
    const anniversaries = await getAnniversaries();
    return NextResponse.json({ anniversaries });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  name: z.string().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const anniversary = await createAnniversary(input);
    return NextResponse.json({ anniversary });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
