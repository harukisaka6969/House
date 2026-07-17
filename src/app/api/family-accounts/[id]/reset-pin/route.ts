import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { resetFamilyPin } from "@/lib/familyAccounts";

const bodySchema = z.object({ pin: z.string().regex(/^\d{4,8}$/, "PINは4〜8桁の数字にしてください") });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const { pin } = bodySchema.parse(await req.json());
    const ok = await resetFamilyPin(id, pin);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
