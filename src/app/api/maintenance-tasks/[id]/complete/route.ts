import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { completeMaintenanceTask } from "@/lib/maintenance";
import { getAllCategories } from "@/lib/categories";

const VALID_ACCOUNTS = ["a1", "a2", "a3", "a4"];

const bodySchema = z.object({
  done_date: z.string(),
  actual_cost: z.number().nonnegative(),
  memo: z.string().max(500).optional().nullable(),
  createExpense: z.boolean().optional(),
  account: z.string().optional(),
  category: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json());

    if (body.createExpense) {
      if (!body.account || !VALID_ACCOUNTS.includes(body.account)) throw new ApiError(400, "invalid account");
      const allCats = await getAllCategories();
      if (!body.category || !allCats.includes(body.category)) throw new ApiError(400, "invalid category");
    }

    const logId = await completeMaintenanceTask(id, {
      doneDate: body.done_date,
      actualCost: body.actual_cost,
      memo: body.memo,
      owner: session.profile_id,
      createExpense: !!body.createExpense,
      accountId: body.account,
      category: body.category,
    });
    return NextResponse.json({ log_id: logId });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
