import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { setLineUserId } from "@/lib/profiles";

const bodySchema = z.object({ line_user_id: z.string().trim().max(64) });

/** 本人のLINEユーザーIDを設定・解除する（空文字で解除）。owner本人が自分の分だけ操作できる。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { line_user_id } = bodySchema.parse(await req.json());
    await setLineUserId(session.profile_id, line_user_id || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
