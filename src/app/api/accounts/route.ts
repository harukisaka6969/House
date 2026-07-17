import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getAccounts, updateAccounts } from "@/lib/accounts";

const putSchema = z.object({
  accounts: z
    .array(
      z.object({
        id: z.enum(["a1", "a2", "a3", "a4"]),
        name: z.string().optional(),
        budget: z.number().optional(),
      })
    )
    .max(4),
});

export async function GET() {
  try {
    await requireOwnerSession();
    return NextResponse.json({ accounts: await getAccounts() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireOwnerSession();
    const { accounts } = putSchema.parse(await req.json());
    return NextResponse.json({ accounts: await updateAccounts(accounts) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
