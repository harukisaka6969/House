import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getRecurringExpenses, createRecurringExpense, ValidationError } from "@/lib/recurringExpenses";
import { getAllCategories } from "@/lib/categories";

export async function GET() {
  try {
    const session = await requireOwnerSession();
    const items = await getRecurringExpenses(session.profile_id);
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.object({
  account_id: z.string(),
  category: z.string(),
  amount: z.number(),
  memo: z.string().max(200).optional(),
  day_of_month: z.number().int().min(1).max(28),
});

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const input = bodySchema.parse(await req.json());
    const allCats = await getAllCategories();
    const item = await createRecurringExpense(session.profile_id, input, allCats);
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
