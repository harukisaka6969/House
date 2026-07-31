import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { setIdeaNoteVisibility } from "@/lib/ideaNotes";

const bodySchema = z.object({ shared: z.boolean() });

/** 共有・非公開の切り替え。owner本人のみ実行できる。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const { shared } = bodySchema.parse(await req.json());
    const note = await setIdeaNoteVisibility(id, session.profile_id, shared ? "shared" : "private");
    if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ note });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
