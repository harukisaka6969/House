import { NextResponse } from "next/server";
import { getSplitEventByToken, getSplitParticipants, getSplitExpenses, getSplitExpenseSharesForEvent } from "@/lib/splitEvents";
import { computeBalances, simplifySettlement } from "@/lib/splitSettlement";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const limited = rateLimit(`split-read:${token}:${clientIp(req)}`, 120, 60 * 1000);
    if (!limited.ok) return NextResponse.json({ error: "アクセスが多すぎます。少し待ってから試してください。" }, { status: 429 });

    const event = await getSplitEventByToken(token);
    if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

    const [participants, expenses, sharesByExpense] = await Promise.all([
      getSplitParticipants(event.id),
      getSplitExpenses(event.id),
      getSplitExpenseSharesForEvent(event.id),
    ]);
    const balances = computeBalances(participants, expenses, sharesByExpense);
    const settlement = simplifySettlement(balances);

    const nameOf = new Map(participants.map((p) => [p.id, p.name]));
    const expensesOut = expenses.map((e) => ({
      id: e.id,
      payerId: e.payer_id,
      payerName: nameOf.get(e.payer_id) ?? "?",
      amount: Number(e.amount),
      memo: e.memo,
      date: e.date,
      beneficiaryIds: sharesByExpense[e.id] ?? [],
      beneficiaryNames: (sharesByExpense[e.id] ?? []).map((id) => nameOf.get(id) ?? "?"),
    }));

    return NextResponse.json({
      event: { id: event.id, name: event.name },
      participants: participants.map((p) => ({ id: p.id, name: p.name })),
      expenses: expensesOut,
      balances,
      settlement,
    });
  } catch (e) {
    console.error("split token fetch failed", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
