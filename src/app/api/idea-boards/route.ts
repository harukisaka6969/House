import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getIdeaBoards, createIdeaBoard } from "@/lib/ideaBoards";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const boards = await getIdeaBoards(session.profile_id);
    return NextResponse.json({ boards });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({ name: z.string().min(1).max(60) });

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { name } = bodySchema.parse(await req.json());
    const board = await createIdeaBoard(session.profile_id, name);
    return NextResponse.json({ board });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
