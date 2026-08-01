import { NextResponse } from "next/server";
import { requireOwnerSession, errorResponse, ApiError } from "@/lib/apiAuth";
import { isValidDateStr, periodKeyOfDate } from "@/lib/date";
import { getExpensesInRange } from "@/lib/expenses";
import { getIncomesInMonthRange } from "@/lib/incomes";
import { getInvestmentsInRange } from "@/lib/investments";
import { getAccounts } from "@/lib/accounts";
import { getAllProfiles, makeNameLookup } from "@/lib/profiles";
import { buildAnalysisExport, analysisExportToCsv, type AnalysisFilters, type AnalysisType, type Granularity, type OwnerFilter } from "@/lib/analysisExport";
import { getProfileById } from "@/lib/pinAuth";
import { getAllWishlistItems } from "@/lib/wishlist";
import { getLifeEvents } from "@/lib/lifeEvents";
import { getMaintenanceTasks } from "@/lib/maintenance";

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function parseSet(param: string | null): Set<string> | null {
  if (!param) return null;
  const items = param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? new Set(items) : null;
}

export async function GET(req: Request) {
  try {
    const session = await requireOwnerSession();
    const { searchParams } = new URL(req.url);

    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to || !isValidDateStr(from) || !isValidDateStr(to) || from > to) {
      throw new ApiError(400, "from/to (YYYY-MM-DD) を正しく指定してください");
    }

    const typesParam = searchParams.get("types");
    const types = typesParam
      ? new Set(typesParam.split(",").map((s) => s.trim()) as AnalysisType[])
      : new Set<AnalysisType>(["expenses", "incomes", "investments", "wishlist", "life_events", "maintenance"]);

    const owner: OwnerFilter = searchParams.get("owner") === "me" ? "me" : "all";
    const format = searchParams.get("format") === "csv" ? "csv" : "json";
    const granularityParam = searchParams.get("granularity");
    const granularity: Granularity = granularityParam === "daily" || granularityParam === "monthly" ? granularityParam : "raw";

    const filters: AnalysisFilters = {
      from,
      to,
      types,
      accountIds: parseSet(searchParams.get("accounts")),
      categories: parseSet(searchParams.get("categories")),
      owner,
      granularity,
    };

    const toExclusive = addDays(to, 1);
    const [expenseRows, incomeRows, investmentRows, accounts, profiles, requester, wishlistRows, lifeEventRows, maintenanceTaskRows] = await Promise.all([
      getExpensesInRange(from, toExclusive),
      getIncomesInMonthRange(periodKeyOfDate(from), periodKeyOfDate(to)),
      getInvestmentsInRange(from, toExclusive),
      getAccounts(),
      getAllProfiles(),
      getProfileById(session.profile_id),
      getAllWishlistItems(),
      getLifeEvents(),
      getMaintenanceTasks(),
    ]);
    const nameOf = makeNameLookup(profiles);

    const result = buildAnalysisExport({
      viewerProfileId: session.profile_id,
      requesterName: requester?.name ?? "",
      accounts,
      nameOf,
      expenseRows,
      incomeRows,
      investmentRows,
      wishlistRows,
      lifeEventRows,
      maintenanceTaskRows,
      filters,
    });

    if (format === "csv") {
      const csv = analysisExportToCsv(result);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="kakeibo-${from}_${to}.csv"`,
        },
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
