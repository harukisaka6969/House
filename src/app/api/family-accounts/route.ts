import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { createFamilyAccount, SlugTakenError } from "@/lib/familyAccounts";
import { isValidPatternCode } from "@/lib/pattern";

const bodySchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{3,32}$/, "半角英小文字・数字・ハイフンで3〜32文字にしてください"),
    name: z.string().min(1).max(40),
    auth_method: z.enum(["pin", "pattern"]).default("pin"),
    credential: z.string().min(4).max(32),
  })
  .refine((b) => (b.auth_method === "pin" ? /^\d{4,8}$/.test(b.credential) : isValidPatternCode(b.credential)), {
    message: "認証情報の形式が正しくありません",
    path: ["credential"],
  });

export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const { slug, name, auth_method, credential } = bodySchema.parse(await req.json());
    const account = await createFamilyAccount(slug, name, credential, auth_method);
    return NextResponse.json({ account });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    if (e instanceof SlugTakenError) return NextResponse.json({ error: "そのURLはすでに使われています" }, { status: 409 });
    return errorResponse(e);
  }
}
