import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { addAlias, DuplicateAliasError } from "@/lib/people";

const bodySchema = z.object({ alias: z.string().min(1).max(100) });

/** 表記ゆれを1件追加する（人名の別表記を後から気付いたときの登録フォーム）。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwnerSession();
    const { id } = await ctx.params;
    const { alias } = bodySchema.parse(await req.json());
    const row = await addAlias(id, alias);
    return NextResponse.json({ alias: row });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof DuplicateAliasError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
