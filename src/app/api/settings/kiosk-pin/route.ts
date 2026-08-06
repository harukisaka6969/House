import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { setKioskPin, KIOSK_SLUG } from "@/lib/pinAuth";

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, "PINは4〜8桁の数字にしてください"),
});

/** 共用ダッシュボード（/kiosk）専用ログインのPINを設定・変更する。owner本人なら誰でも実行できる（家族の管理操作）。 */
export async function POST(req: Request) {
  try {
    await requireOwnerSession();
    const { pin } = bodySchema.parse(await req.json());
    await setKioskPin(pin);
    return NextResponse.json({ ok: true, slug: KIOSK_SLUG });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
