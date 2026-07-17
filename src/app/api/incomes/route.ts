import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { isValidMonthKey, nowMonthKeyJST } from "@/lib/date";
import { getIncomes, replaceIncomes } from "@/lib/incomes";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";

const incomeSchema = z.object({
  name: z.string(),
  amount: z.number(),
  owner: z.string().nullable().optional(),
});
const putSchema = z.object({ incomes: z.array(incomeSchema).max(50) });

export async function GET(req: Request) {
  try {
    await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const m = searchParams.get("m") ?? nowMonthKeyJST();
    if (!isValidMonthKey(m)) throw new ApiError(400, "invalid month");
    const [rows, profiles] = await Promise.all([getIncomes(m), getAllProfiles()]);
    const nameOf = makeNameLookup(profiles);
    return NextResponse.json({ incomes: rows.map((r) => ({ ...r, owner_name: r.owner ? nameOf(r.owner) : null })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const m = searchParams.get("m") ?? nowMonthKeyJST();
    if (!isValidMonthKey(m)) throw new ApiError(400, "invalid month");
    const { incomes } = putSchema.parse(await req.json());
    const rows = await replaceIncomes(m, incomes);
    return NextResponse.json({ incomes: rows });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
