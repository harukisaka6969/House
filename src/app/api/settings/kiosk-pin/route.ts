import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { setKioskPin, KIOSK_SLUG } from "@/lib/pinAuth";
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

/** 共用ダッシュボード（/kiosk）専用ログインのPIN／パターンを設定・変更する。owner本人なら誰でも実行できる（家族の管理操作）。 */
export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const { auth_method, credential } = bodySchema.parse(await req.json());
    await setKioskPin(credential, auth_method);
    return NextResponse.json({ ok: true, slug: KIOSK_SLUG });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
