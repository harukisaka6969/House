import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession, errorResponse } from "@/lib/apiAuth";
import { getHouseholdExpenseAmountsForDate, upsertSentiment } from "@/lib/expenseSentiment";
import { todayStrJST } from "@/lib/date";

const bodySchema = z.object({ sentiment: z.enum(["good", "bad"]) });

/** 今日の合計（世帯分）はクライアントから受け取らず、常にサーバー側で計算し直してから記録する。 */
export async function POST(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { sentiment } = bodySchema.parse(await req.json());
    const date = todayStrJST();
    const amounts = await getHouseholdExpenseAmountsForDate(date);
    const total = amounts.reduce((s, a) => s + a, 0);
    const row = await upsertSentiment(session.profile_id, date, total, sentiment);
    return NextResponse.json({ sentiment: row });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "invalid request" }, { status: 400 });
    return errorResponse(e);
  }
}
