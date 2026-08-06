import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { setLineUserId } from "@/lib/profiles";

const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/;

const bodySchema = z.object({ line_user_id: z.string().max(80) });

/** 本人のLINEユーザーIDを設定・解除する（空文字で解除）。owner本人が自分の分だけ操作できる。
 * コピペ時に混入しがちな空白（途中の改行・スペースを含む）は除去してから形式検証する。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { line_user_id: raw } = bodySchema.parse(await req.json());
    const cleaned = raw.replace(/\s+/g, "");

    if (cleaned && !LINE_USER_ID_RE.test(cleaned)) {
      return NextResponse.json(
        { error: "LINEユーザーIDの形式が正しくありません（Uで始まる33文字のはずです）。コピペ時に余分な文字が入っていないか確認してください。" },
        { status: 400 }
      );
    }

    await setLineUserId(session.profile_id, cleaned || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
