import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { replaceJournalExpenses, ValidationError } from "@/lib/expenses";
import { extractMoneyMentions, extractExpensesFromJournal } from "@/lib/anthropic";
import { getAllCategories } from "@/lib/categories";
import { getAccounts } from "@/lib/accounts";
import { A1_ONLY_CATEGORIES, A3_ONLY_CATEGORIES } from "@/lib/constants";
import { isValidDateStr } from "@/lib/date";

const bodySchema = z.object({ text: z.string().max(5000) });
const AI_ERROR_MESSAGE = "AIによる抽出に失敗しました。時間をおいてもう一度お試しください。";

/**
 * 日記本文からお金の動きを推測し、その日の日記由来支出(source='journal')を置き換える（押すたびに冪等）。
 * 2段階: ①お金に関係する記述だけを抜き出す → ②その記述だけを口座・カテゴリ・金額に分類する。
 * 一度に長い日記全文を分類させるより、各ステップの入力が短く済み安定しやすい。
 */
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

    let mentions: string[];
    try {
      mentions = await extractMoneyMentions(text);
    } catch (err) {
      console.error("extractMoneyMentions failed", err);
      throw new ApiError(502, `${AI_ERROR_MESSAGE}（詳細: ${err instanceof Error ? err.message : String(err)}）`);
    }

    if (mentions.length === 0) {
      const expenses = await replaceJournalExpenses(session.profile_id, date, [], []);
      return NextResponse.json({ expenses });
    }

    const [accounts, allCats] = await Promise.all([getAccounts(), getAllCategories()]);

    let extracted;
    try {
      extracted = await extractExpensesFromJournal(mentions.join("\n"), accounts, allCats);
    } catch (err) {
      console.error("extractExpensesFromJournal failed", err);
      throw new ApiError(502, `${AI_ERROR_MESSAGE}（詳細: ${err instanceof Error ? err.message : String(err)}）`);
    }

    const valid = extracted.filter((e) => Number(e.amount) > 0);
    const entries = valid.map((e) => {
      const category = e.category && allCats.includes(e.category) ? e.category : "その他";
      let account_id = accounts.some((a) => a.id === e.account) ? (e.account as string) : "a1";
      // カテゴリが特定口座専用の場合は、口座側をカテゴリに合わせて上書きする（画面側の絞り込みと矛盾させないため）。
      if ((A1_ONLY_CATEGORIES as readonly string[]).includes(category)) account_id = "a1";
      else if ((A3_ONLY_CATEGORIES as readonly string[]).includes(category)) account_id = "a3";
      return { account_id, category, amount: Number(e.amount), memo: e.memo ?? "" };
    });

    const rows = await replaceJournalExpenses(session.profile_id, date, entries, allCats);
    return NextResponse.json({ expenses: rows });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
