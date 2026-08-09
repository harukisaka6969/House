import { NextResponse } from "next/server";
import { z } from "zod";
import { getSplitEventByToken, addSplitExpense, SplitValidationError } from "@/lib/splitEvents";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const bodySchema = z.object({
  payerId: z.string().uuid(),
  beneficiaryIds: z.array(z.string().uuid()).min(1),
  amount: z.number().positive(),
  memo: z.string().max(200).optional().default(""),
  date: z.string(),
});

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const limited = rateLimit(`split-write:${token}:${clientIp(req)}`, 60, 60 * 1000);
    if (!limited.ok) return NextResponse.json({ error: "アクセスが多すぎます。少し待ってから試してください。" }, { status: 429 });

    const event = await getSplitEventByToken(token);
    if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

    const input = bodySchema.parse(await req.json());
    const expense = await addSplitExpense(event.id, input);
    return NextResponse.json({ expense });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof SplitValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("split expense add failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
