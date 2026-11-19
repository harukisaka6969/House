import { NextResponse } from "next/server";
import { getActiveRecurringExpensesForDay, markRecurringExpenseGenerated } from "@/lib/recurringExpenses";
import { createExpenseFromRecurring } from "@/lib/expenses";
import { generateRecurringIncomes } from "@/lib/recurringIncomes";
import { todayStrJST, periodKeyOfDate } from "@/lib/date";

/** Vercel Cronから毎日呼ばれる。今日が支払日の定期支払をexpensesへ生成する（同月に生成済みならスキップ、冪等）。
 * あわせて、毎月の定期収入（給与など）を今月の incomes に登録する（月に1回だけ）。 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = todayStrJST();
  const day = Number(today.slice(8, 10));
  const monthKey = periodKeyOfDate(today);

  const due = await getActiveRecurringExpensesForDay(day);
  let created = 0;
  for (const r of due) {
    if (r.last_generated_month === monthKey) continue;
    await createExpenseFromRecurring(r.owner, today, {
      account_id: r.account_id,
      category: r.category,
      amount: r.amount,
      memo: r.memo,
    });
    await markRecurringExpenseGenerated(r.id, monthKey);
    created++;
  }

  const incomesCreated = await generateRecurringIncomes(monthKey);

  return NextResponse.json({ date: today, checked: due.length, created, incomesCreated });
}
