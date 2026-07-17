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

    const { from, toExclusive } = monthRange(m);
    const [expenseRows, incomeRows, investmentRows, accounts, profiles, cumInvest] = await Promise.all([
      getExpensesInRange(from, toExclusive),
      getIncomes(m),
      getInvestmentsInRange(from, toExclusive),
      getAccounts(),
      getAllProfiles(),
      getCumulativeInvestment(),
    ]);
    const nameOf = makeNameLookup(profiles);

    const expenses = maskExpenses(expenseRows, session.profile_id, nameOf);
    const incomes = incomeRows.map((i) => ({ ...i, owner_name: i.owner ? nameOf(i.owner) : null }));
    const investments = investmentRows.map((iv) => ({ ...iv, owner_name: nameOf(iv.owner) }));

    const aggregates = {
      perAccount: buildPerAccount(accounts, expenseRows, session.profile_id),
      monthTotals: buildMonthTotals(incomeRows, expenseRows, investmentRows),
      perCategory: buildPerCategory(expenseRows, session.profile_id),
      perDay: buildPerDay(expenseRows, session.profile_id),
      cumInvest,
    };

    return NextResponse.json({ month: m, incomes, expenses, investments, aggregates });
  } catch (e) {
    return errorResponse(e);
  }
}
