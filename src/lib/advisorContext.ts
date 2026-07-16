import "server-only";
import { fmt } from "./judge";
import { getAccounts } from "./accounts";
import { getIncomes } from "./incomes";
import { getExpensesInRange, monthRange } from "./expenses";
import { getInvestmentsInRange, getCumulativeInvestment } from "./investments";
import { getAllProfiles, makeNameLookup } from "./profiles";
import { getTrend } from "./trend";
import { buildPerAccount, buildPerCategory, buildMonthTotals, buildMonthJudge, isMaskedForViewer } from "./aggregate";

/** 現行版 buildAgentContext を移植。相手の第3口座明細（§5）はここで構築時に除外する。 */
export async function buildAdvisorContext(viewerProfileId: string, viewerName: string, monthKey: string): Promise<string> {
  const { from, toExclusive } = monthRange(monthKey);
  const [accounts, incomeRows, expenseRows, investmentRows, profiles, trend, cumInvest] = await Promise.all([
    getAccounts(),
    getIncomes(monthKey),
    getExpensesInRange(from, toExclusive),
    getInvestmentsInRange(from, toExclusive),
    getAllProfiles(),
    getTrend(),
    getCumulativeInvestment(),
  ]);
  const nameOf = makeNameLookup(profiles);
  const partner = profiles.find((p) => p.id !== viewerProfileId);

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

注意: 第3口座は夫婦間のプライベート口座であり、${partner?.name ?? "相手"}の第3口座の明細はあなたにも渡されていません。内容を聞かれたら「非公開のため分かりません」と答えてください。`;
}
