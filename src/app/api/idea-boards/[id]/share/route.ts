import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { setIdeaBoardShared } from "@/lib/ideaBoards";

const bodySchema = z.object({ shared: z.boolean() });

/** ボードの共有プリセットの切り替え。owner本人のみ実行できる。trueにすると
 * ボード内の既存・今後作成する全メモが自動的にパートナーと共有された扱いになる。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const { shared } = bodySchema.parse(await req.json());
    const board = await setIdeaBoardShared(id, session.profile_id, shared);
    if (!board) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ board });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
