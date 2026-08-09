import { NextResponse } from "next/server";
import { getSplitEventByToken, deleteSplitExpense } from "@/lib/splitEvents";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function DELETE(req: Request, ctx: { params: Promise<{ token: string; expenseId: string }> }) {
  try {
    const { token, expenseId } = await ctx.params;
    const limited = rateLimit(`split-write:${token}:${clientIp(req)}`, 60, 60 * 1000);
    if (!limited.ok) return NextResponse.json({ error: "アクセスが多すぎます。少し待ってから試してください。" }, { status: 429 });

    const event = await getSplitEventByToken(token);
    if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

    const ok = await deleteSplitExpense(expenseId, event.id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("split expense delete failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
