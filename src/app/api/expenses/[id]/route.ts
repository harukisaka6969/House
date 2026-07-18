import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { deleteExpense, updateExpense, ValidationError } from "@/lib/expenses";
import { getAllCategories } from "@/lib/categories";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const ok = await deleteExpense(id, session.profile_id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

const patchSchema = z.object({
  date: z.string().optional(),
  account_id: z.string().optional(),
  category: z.string().optional(),
  sub: z.string().nullable().optional(),
  amount: z.number().optional(),
  memo: z.string().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const patch = patchSchema.parse(await req.json());
    const allCats = await getAllCategories();
    const expense = await updateExpense(id, session.profile_id, patch, allCats);
    return NextResponse.json({ expense });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
