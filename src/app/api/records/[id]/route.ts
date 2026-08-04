import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { updateRecord, deleteRecord } from "@/lib/personalRecords";

const patchSchema = z.object({
  category: z.string().min(1).max(40).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  title: z.string().max(60).optional(),
  metrics: z.array(z.object({ label: z.string().max(40), value: z.string().max(60) })).max(30).optional(),
  memo: z.string().max(500).optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const patch = patchSchema.parse(await req.json());
    const record = await updateRecord(id, session.profile_id, patch);
    if (!record) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ record: { id: record.id, category: record.category, date: record.date, title: record.title, metrics: record.metrics, memo: record.memo, created_at: record.created_at } });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteRecord(id, session.profile_id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
