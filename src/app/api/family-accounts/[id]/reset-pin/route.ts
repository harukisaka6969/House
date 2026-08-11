import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { resetFamilyPin } from "@/lib/familyAccounts";
import { isValidPatternCode } from "@/lib/pattern";

const bodySchema = z
  .object({
    auth_method: z.enum(["pin", "pattern"]).default("pin"),
    credential: z.string().min(4).max(32),
  })
  .refine((b) => (b.auth_method === "pin" ? /^\d{4,8}$/.test(b.credential) : isValidPatternCode(b.credential)), {
    message: "認証情報の形式が正しくありません",
    path: ["credential"],
  });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const { auth_method, credential } = bodySchema.parse(await req.json());
    const ok = await resetFamilyPin(id, credential, auth_method);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
