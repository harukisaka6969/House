import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { addExpenseEntries, ValidationError, type NewExpenseInput } from "@/lib/expenses";
import { getAllCategories } from "@/lib/categories";

const entrySchema = z.object({
  date: z.string().optional().nullable(),
  account_id: z.string(),
  category: z.string(),
  sub: z.string().optional().nullable(),
  amount: z.number(),
  memo: z.string().optional().nullable(),
  original_currency: z.string().optional().nullable(),
  original_amount: z.number().optional().nullable(),
  exchange_rate: z.number().optional().nullable(),
});
const bodySchema = z.object({ entries: z.array(entrySchema).min(1).max(50) });

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { entries } = bodySchema.parse(await req.json());
    const allCats = await getAllCategories();
    const result = await addExpenseEntries(session.profile_id, entries as NewExpenseInput[], allCats);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
