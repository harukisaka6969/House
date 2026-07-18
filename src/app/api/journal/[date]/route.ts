import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { upsertJournalEntry, deleteJournalEntry } from "@/lib/journal";
import { getJournalExpensesForDate } from "@/lib/expenses";
import { profileNameOf } from "@/lib/profiles";
import { isValidDateStr } from "@/lib/date";

const bodySchema = z.object({ body: z.string().max(5000) });

export async function GET(_req: Request, ctx: { params: Promise<{ date: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { date } = await ctx.params;
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");
    const [rows, ownerName] = await Promise.all([
      getJournalExpensesForDate(session.profile_id, date),
      profileNameOf(session.profile_id),
    ]);
    const journalExpenses = rows.map(({ owner, ...rest }) => {
      void owner;
      return { ...rest, owner_name: ownerName, masked: false as const };
    });
    return NextResponse.json({ journalExpenses });
  } catch (e) {
    return errorResponse(e);
  }
}

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
