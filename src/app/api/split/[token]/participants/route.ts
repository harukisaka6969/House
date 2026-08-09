import { NextResponse } from "next/server";
import { z } from "zod";
import { getSplitEventByToken, addSplitParticipant } from "@/lib/splitEvents";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const bodySchema = z.object({ name: z.string().min(1).max(40) });

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const limited = rateLimit(`split-write:${token}:${clientIp(req)}`, 60, 60 * 1000);
    if (!limited.ok) return NextResponse.json({ error: "アクセスが多すぎます。少し待ってから試してください。" }, { status: 429 });

    const event = await getSplitEventByToken(token);
    if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { name } = bodySchema.parse(await req.json());
    const participant = await addSplitParticipant(event.id, name);
    return NextResponse.json({ participant });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    console.error("split participant add failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
