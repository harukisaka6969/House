import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { isValidMonthKey, nowMonthKeyJST } from "@/lib/date";
import { getExpensesInRange, monthRange } from "@/lib/expenses";
import { getIncomes } from "@/lib/incomes";
import { getInvestmentsInRange, getCumulativeInvestment } from "@/lib/investments";
import { getAccounts } from "@/lib/accounts";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";
import { maskExpenses, buildPerAccount, buildPerCategory, buildPerDay, buildMonthTotals } from "@/lib/aggregate";

export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);
    const m = searchParams.get("m") ?? nowMonthKeyJST();
    if (!isValidMonthKey(m)) throw new ApiError(400, "invalid month");
    // 「誰の視点で見るか」フィルタ（お金グループ共通のトグル）。集計にのみ影響させ、
    // incomes等の生配列はそのまま返す — 収入の全置き換え編集フロー（addIncome）が
    // month.incomesを基準にするため、ここを絞ると他方の収入が消えてしまう。
    const owner = searchParams.get("owner") || undefined;

    const { from, toExclusive } = monthRange(m);
    const [expenseRows, incomeRows, investmentRows, accounts, profiles, cumInvest] = await Promise.all([
      getExpensesInRange(from, toExclusive),
      getIncomes(m),
      getInvestmentsInRange(from, toExclusive),
      getAccounts(),
      getAllProfiles(),
      getCumulativeInvestment(owner),
    ]);
    const nameOf = makeNameLookup(profiles);

    const expenses = maskExpenses(expenseRows, session.profile_id, nameOf);
    const incomes = incomeRows.map((i) => ({ ...i, owner_name: i.owner ? nameOf(i.owner) : null }));
    const investments = investmentRows.map((iv) => ({ ...iv, owner_name: nameOf(iv.owner) }));

    const aggExpenses = owner ? expenseRows.filter((e) => e.owner === owner) : expenseRows;
    const aggIncomes = owner ? incomeRows.filter((i) => i.owner === owner || i.owner === null) : incomeRows;
    const aggInvestments = owner ? investmentRows.filter((iv) => iv.owner === owner) : investmentRows;

    const aggregates = {
      perAccount: buildPerAccount(accounts, aggExpenses, session.profile_id),
      monthTotals: buildMonthTotals(aggIncomes, aggExpenses, aggInvestments),
      perCategory: buildPerCategory(aggExpenses, session.profile_id),
      perDay: buildPerDay(aggExpenses, session.profile_id),
      cumInvest,
    };

    return NextResponse.json({ month: m, incomes, expenses, investments, aggregates });
  } catch (e) {
    return errorResponse(e);
  }
}
