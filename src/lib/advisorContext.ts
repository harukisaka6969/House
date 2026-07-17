import "server-only";
import { fmt } from "./judge";
import { getAccounts } from "./accounts";
import { getIncomes } from "./incomes";
import { getExpensesInRange, monthRange } from "./expenses";
import { getInvestmentsInRange, getCumulativeInvestment } from "./investments";
import { getAllProfiles, makeNameLookup, findPartnerOwner } from "./profiles";
import { getTrend } from "./trend";
import { buildPerAccount, buildPerCategory, buildMonthTotals, buildMonthJudge, isMaskedForViewer } from "./aggregate";
import { getAllWishlistItems, visibleWishlistItems } from "./wishlist";
import { getLifeEvents } from "./lifeEvents";
import { getTasksDueWithinDays, getRecentLogsWithAsset } from "./maintenance";
import { todayStrJST } from "./date";

/** 現行版 buildAgentContext を移植。相手の第3口座明細（§5）はここで構築時に除外する。 */
export async function buildAdvisorContext(viewerProfileId: string, viewerName: string, monthKey: string): Promise<string> {
  const { from, toExclusive } = monthRange(monthKey);
  const oneYearAgo = (() => {
    const [y, m, d] = todayStrJST().split("-").map(Number);
    return new Date(Date.UTC(y - 1, m - 1, d)).toISOString().slice(0, 10);
  })();
  const [accounts, incomeRows, expenseRows, investmentRows, profiles, trend, cumInvest, wishlistRows, lifeEvents, upcomingTasks, recentLogs] = await Promise.all([
    getAccounts(),
    getIncomes(monthKey),
    getExpensesInRange(from, toExclusive),
    getInvestmentsInRange(from, toExclusive),
    getAllProfiles(),
    getTrend(),
    getCumulativeInvestment(),
    getAllWishlistItems(),
    getLifeEvents(),
    getTasksDueWithinDays(180),
    getRecentLogsWithAsset(oneYearAgo),
  ]);
  const nameOf = makeNameLookup(profiles);
  const partner = findPartnerOwner(profiles, viewerProfileId);

  const perAccount = buildPerAccount(accounts, expenseRows, viewerProfileId);
  const totals = buildMonthTotals(incomeRows, expenseRows, investmentRows);
  const judge = buildMonthJudge(totals);
  const perCategory = buildPerCategory(expenseRows, viewerProfileId);

  const acctLines = perAccount
    .map((a) => `- ${a.name}: 予算${fmt(a.budget)} / 使用${fmt(a.spent)}（判定: ${a.judge.label}）`)
    .join("\n");
  const catLine = perCategory.map((c) => `${c.name} ${fmt(c.value)}`).join(", ");
  const trendLines = trend.map((t) => `${t.month}: 収入${fmt(t.income)} 支出${fmt(t.expense)} 投資${fmt(t.invest)}`).join("\n");

  const visibleExpenses = expenseRows.filter((e) => !isMaskedForViewer(e, viewerProfileId)).slice(-40);
  const items = visibleExpenses
    .map((e) => {
      const acct = accounts.find((a) => a.id === e.account_id);
      return `${e.date} ${acct?.name ?? ""} ${e.category} ${fmt(e.amount)} ${e.memo || ""}`;
    })
    .join("\n");
  const invItems = investmentRows.map((iv) => `${iv.date} ${iv.name} ${fmt(iv.amount)} ${iv.memo || ""}`).join("\n");

  const visibleWishlist = visibleWishlistItems(wishlistRows, viewerProfileId).filter((w) => w.status === "planning" || w.status === "saving");
  const wishlistLines = visibleWishlist
    .map((w) => `- ${w.name}（${w.status === "saving" ? "貯蓄中" : "検討中"}）: 価格${fmt(w.price)} / 貯蓄済${fmt(w.saved)} / 月々${fmt(w.monthly_plan)}${w.is_private ? "（本人限定）" : ""}`)
    .join("\n");

  const activeEvents = lifeEvents.filter((e) => e.status === "active");
  const eventLines = activeEvents
    .map((e) => {
      const mid = Math.round((e.cost_low + e.cost_high) / 2);
      return `- ${e.name}（${e.event_year}年）: 必要額目安${fmt(mid)} / 準備済み${fmt(e.funded)} / 残り${fmt(Math.max(mid - e.funded, 0))}`;
    })
    .join("\n");

  const maintenanceLines = upcomingTasks.map((t) => `- ${t.name}: 予定日${t.next_due} / 想定費用${fmt(t.est_cost)}`).join("\n");
  const maintenanceAnnualActual = recentLogs.reduce((s, l) => s + l.actual_cost, 0);

  void nameOf; // owner names not surfaced in the advisor context, only used elsewhere

  return `あなたは「坂家」の家計ダッシュボードに組み込まれた家計アドバイザーAIです。以下のデータに基づき、日本語で簡潔（原則300字以内）、率直かつ具体的に分析・アドバイスしてください。データにない事柄は推測であると明示すること。特定の金融商品の売買推奨はしないこと。

【現在の利用者】${viewerName}
【対象月】${monthKey}
【今月】収入 ${fmt(totals.income)} / 支出 ${fmt(totals.expense)} / 投資 ${fmt(totals.invest)} / 収支 ${fmt(totals.income - totals.expense)} / 総合判定: ${judge.label}
【口座別】
${acctLines}
【カテゴリ別支出】${catLine || "なし"}
【月別推移】
${trendLines || "データなし"}
【今月の支出明細（相手のプライベート第3口座分は除外済み・直近40件）】
${items || "なし"}
【今月の投資】
${invItems || "なし"}
【累計投資額】${fmt(cumInvest)}
【買いたいものリスト（検討中・貯蓄中のみ）】
${wishlistLines || "なし"}
【将来設計イベント】
${eventLines || "なし"}
【今後6ヶ月のメンテ予定】
${maintenanceLines || "なし"}
【直近1年のメンテ実績費用】${fmt(maintenanceAnnualActual)}

注意: 第3口座は夫婦間のプライベート口座であり、${partner?.name ?? "相手"}の第3口座の明細はあなたにも渡されていません。内容を聞かれたら「非公開のため分かりません」と答えてください。相手のis_private=trueのウィッシュアイテムも同様に渡されていません。`;
}
