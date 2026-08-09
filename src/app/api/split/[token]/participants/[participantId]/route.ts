import { NextResponse } from "next/server";
import { getSplitEventByToken, deleteSplitParticipant } from "@/lib/splitEvents";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function DELETE(req: Request, ctx: { params: Promise<{ token: string; participantId: string }> }) {
  try {
    const { token, participantId } = await ctx.params;
    const limited = rateLimit(`split-write:${token}:${clientIp(req)}`, 60, 60 * 1000);
    if (!limited.ok) return NextResponse.json({ error: "アクセスが多すぎます。少し待ってから試してください。" }, { status: 429 });

    const event = await getSplitEventByToken(token);
    if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

    const ok = await deleteSplitParticipant(participantId, event.id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("split participant delete failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
