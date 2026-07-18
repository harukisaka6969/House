import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { replaceJournalExpenses, ValidationError } from "@/lib/expenses";
import { extractExpensesFromJournal } from "@/lib/anthropic";
import { getAllCategories } from "@/lib/categories";
import { getAccounts } from "@/lib/accounts";
import { isValidDateStr } from "@/lib/date";

const bodySchema = z.object({ text: z.string().max(5000) });

/** 日記本文からお金の動きを推測し、その日の日記由来支出(source='journal')を置き換える（保存のたびに冪等）。 */
export async function POST(req: Request, ctx: { params: Promise<{ date: string }> }) {
  try {
    const session = await requireOwnerSession();
    const { date } = await ctx.params;
    if (!isValidDateStr(date)) throw new ApiError(400, "invalid date");
    const { text } = bodySchema.parse(await req.json());

    if (!text.trim()) {
      const expenses = await replaceJournalExpenses(session.profile_id, date, [], []);
      return NextResponse.json({ expenses });
    }

    const [accounts, allCats] = await Promise.all([getAccounts(), getAllCategories()]);
    const extracted = await extractExpensesFromJournal(text, accounts, allCats);
    const valid = extracted.filter((e) => Number(e.amount) > 0);
    const entries = valid.map((e) => ({
      account_id: accounts.some((a) => a.id === e.account) ? (e.account as string) : "a1",
      category: e.category && allCats.includes(e.category) ? e.category : "その他",
      amount: Number(e.amount),
      memo: e.memo ?? "",
    }));

    const rows = await replaceJournalExpenses(session.profile_id, date, entries, allCats);
    return NextResponse.json({ expenses: rows });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
