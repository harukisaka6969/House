import "server-only";
import { db } from "./db";
import { getExpensesInRange } from "./expenses";
import { getIncomesInMonthRange } from "./incomes";
import { getInvestmentsInRange } from "./investments";
import { buildPerCategory, isMaskedForViewer, sumAmount } from "./aggregate";
import { nowMonthKeyJST, shiftMonth, periodRange, periodKeyOfDate } from "./date";
import { getAllProfiles, makeNameLookup } from "./profiles";
import type { ExpenseRow, IncomeRow } from "./types";

const SPECIAL_EVENT_THRESHOLD = 300000;
const FALLBACK_MONTHS_BACK = 11;

function isRegularIncome(name: string): boolean {
  return name.startsWith("給与") || name.startsWith("収入（概算");
}

export interface FlowMonthPoint {
  month: string;
  incomeTotal: number;
  incomeRegular: number;
  incomeSpecial: number;
  expenseTotal: number;
  expenseByCategory: { name: string; value: number }[];
  investTotal: number;
  net: number;
  cumulativeNet: number;
}

export interface FlowSpecialEvent {
  type: "income" | "expense";
  date: string;
  name: string;
  amount: number;
  ownerName: string;
}

export interface FlowAnalysis {
  months: FlowMonthPoint[];
  specialEvents: FlowSpecialEvent[];
  categories: string[];
}

async function earliestMonth(): Promise<string> {
  const [{ data: incRow }, { data: expRow }] = await Promise.all([
    db().from("incomes").select("month").order("month", { ascending: true }).limit(1),
    db().from("expenses").select("date").order("date", { ascending: true }).limit(1),
  ]);
  const candidates: string[] = [];
  if (incRow?.[0]?.month) candidates.push(incRow[0].month as string);
  if (expRow?.[0]?.date) candidates.push(periodKeyOfDate(expRow[0].date as string));
  if (candidates.length === 0) return shiftMonth(nowMonthKeyJST(), -FALLBACK_MONTHS_BACK);
  return candidates.sort()[0];
}

/** 家計の月次フロー分析（spec外・資産フロー分析ダッシュボード用）。開始月は記録済みデータの最古月〜今月。 */
export async function getFlowAnalysis(viewerProfileId: string): Promise<FlowAnalysis> {
  const nowMonth = nowMonthKeyJST();
  const startMonth = await earliestMonth();

  const months: string[] = [];
  for (let cursor = startMonth; cursor <= nowMonth; cursor = shiftMonth(cursor, 1)) {
    months.push(cursor);
    if (months.length > 60) break; // safety cap
  }
  const fromDate = periodRange(months[0]).from;
  const toDateExclusive = periodRange(nowMonth).toExclusive;

  const [incomeRows, expenseRows, investRows, profiles] = await Promise.all([
    getIncomesInMonthRange(months[0], nowMonth),
    getExpensesInRange(fromDate, toDateExclusive),
    getInvestmentsInRange(fromDate, toDateExclusive),
    getAllProfiles(),
  ]);
  const nameOf = makeNameLookup(profiles);

  const categorySet = new Set<string>();
  let cumulativeNet = 0;
  const monthPoints: FlowMonthPoint[] = months.map((month) => {
    const incForMonth = incomeRows.filter((r) => r.month === month);
    const expForMonth = expenseRows.filter((r) => periodKeyOfDate(r.date) === month);
    const invForMonth = investRows.filter((r) => periodKeyOfDate(r.date) === month);

    const incomeRegular = sumAmount(incForMonth.filter((r: IncomeRow) => isRegularIncome(r.name)));
    const incomeSpecial = sumAmount(incForMonth.filter((r: IncomeRow) => !isRegularIncome(r.name)));
    const expenseTotal = sumAmount(expForMonth);
    const investTotal = sumAmount(invForMonth);
    const incomeTotal = incomeRegular + incomeSpecial;
    const net = incomeTotal - expenseTotal;
    cumulativeNet += net;

    const perCategory = buildPerCategory(expForMonth, viewerProfileId);
    perCategory.forEach((c) => categorySet.add(c.name));

    return {
      month,
      incomeTotal,
      incomeRegular,
      incomeSpecial,
      expenseTotal,
      expenseByCategory: perCategory,
      investTotal,
      net,
      cumulativeNet,
    };
  });

  const specialEvents: FlowSpecialEvent[] = [
    ...incomeRows
      .filter((r: IncomeRow) => r.amount >= SPECIAL_EVENT_THRESHOLD && !isRegularIncome(r.name))
      .map((r: IncomeRow) => ({
        type: "income" as const,
        date: r.month,
        name: r.name,
        amount: r.amount,
        ownerName: r.owner ? nameOf(r.owner) : "共有",
      })),
    ...expenseRows
      .filter(
        (r: ExpenseRow) =>
          r.amount >= SPECIAL_EVENT_THRESHOLD && !isMaskedForViewer(r, viewerProfileId) && !r.memo?.startsWith("月次支出")
      )
      .map((r: ExpenseRow) => ({
        type: "expense" as const,
        date: r.date,
        name: r.memo || r.category,
        amount: r.amount,
        ownerName: nameOf(r.owner),
      })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { months: monthPoints, specialEvents, categories: [...categorySet] };
}
