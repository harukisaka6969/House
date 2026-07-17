import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { upsertJournalEntry, deleteJournalEntry } from "@/lib/journal";
import { isValidDateStr } from "@/lib/date";

const bodySchema = z.object({ body: z.string().max(5000) });

export async function PUT(req: Request, ctx: { params: Promise<{ date: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { date } = await ctx.params;
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");
    const { body } = bodySchema.parse(await req.json());
    const entry = await upsertJournalEntry(session.profile_id, date, body);
    return NextResponse.json({ entry });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ date: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { date } = await ctx.params;
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");
    const ok = await deleteJournalEntry(session.profile_id, date);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
