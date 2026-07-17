import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { addInvestment } from "@/lib/investments";

const bodySchema = z.object({
  date: z.string().optional().nullable(),
  name: z.string(),
  amount: z.number(),
  memo: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const body = bodySchema.parse(await req.json());
    const investment = await addInvestment(session.profile_id, body);
    return NextResponse.json({ investment });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof Error && !(e instanceof z.ZodError)) {
      // addInvestment throws plain Errors for validation (投資先未入力 / 金額不正)
      if (/未入力|不正/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return errorResponse(e);
  }
}
