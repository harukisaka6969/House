import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { createIdeaNoteLink } from "@/lib/ideaNotes";

const bodySchema = z.object({ from_note: z.string(), to_note: z.string() });

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { from_note, to_note } = bodySchema.parse(await req.json());
    if (from_note === to_note) throw new ApiError(400, "同じメモ同士はつなげられません。");
    const link = await createIdeaNoteLink(from_note, to_note, session.profile_id);
    if (!link) throw new ApiError(404, "接続できませんでした。");
    return NextResponse.json({ link });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
