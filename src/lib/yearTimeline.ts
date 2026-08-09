import "server-only";
import { db } from "./db";
import { getAnniversaries } from "./anniversaries";
import { anniversariesInYear } from "./anniversaryMath";
import { getExpensesInRange } from "./expenses";
import { getJournalEntriesInRange } from "./journal";
import { isMaskedForViewer } from "./aggregate";
import { extractYearHighlightsFromJournal, titleExpenseClusters } from "./anthropic";
import { clusterExpenses, fallbackClusterTitle } from "./expenseCluster";
import type { ExpenseRow } from "./types";

const NOTABLE_CATEGORY = "旅行";
const NOTABLE_AMOUNT_THRESHOLD = 30000;

export interface TimelineChild {
  date: string;
  title: string;
  amount: number;
}

export interface TimelineItem {
  date: string;
  kind: "anniversary" | "expense" | "diary";
  title: string;
  description: string;
  amount?: number;
  children?: TimelineChild[];
}

interface CachedExpenseCluster {
  category: string;
  from: string;
  to: string;
  title: string;
}

export interface YearTimelineHighlightRow {
  id: string;
  owner: string;
  year: number;
  items: { date: string; title: string; description: string }[];
  expense_clusters: CachedExpenseCluster[];
  generated_at: string;
}

/** 定期支払いは「大きな出来事」ではないため除外し、旅行カテゴリか高額な支出だけを拾う（日付昇順）。 */
function notableExpenseRows(rows: ExpenseRow[], viewerProfileId: string): ExpenseRow[] {
  return rows
    .filter((e) => e.source !== "recurring" && !isMaskedForViewer(e, viewerProfileId))
    .filter((e) => e.category === NOTABLE_CATEGORY || e.amount >= NOTABLE_AMOUNT_THRESHOLD)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 支出の塊を大項目（複数件なら子に個々の支出、単発ならそのまま）のタイムライン項目にする。 */
function buildExpenseItems(rows: ExpenseRow[], viewerProfileId: string, cachedClusters: CachedExpenseCluster[]): TimelineItem[] {
  const clusters = clusterExpenses(notableExpenseRows(rows, viewerProfileId));
  return clusters.map((cluster) => {
    const from = cluster[0].date;
    const to = cluster[cluster.length - 1].date;
    const cached =
      cluster.length > 1 ? cachedClusters.find((c) => c.category === cluster[0].category && c.from === from && c.to === to) : undefined;
    return {
      date: from,
      kind: "expense" as const,
      title: cached?.title ?? fallbackClusterTitle(cluster),
      description: cluster[0].category,
      amount: cluster.reduce((s, e) => s + e.amount, 0),
      children: cluster.length > 1 ? cluster.map((e) => ({ date: e.date, title: e.memo || e.category, amount: e.amount })) : undefined,
    };
  });
}

async function getYearTimelineHighlightRow(ownerId: string, year: number): Promise<YearTimelineHighlightRow | null> {
  const { data, error } = await db().from("year_timeline_highlights").select("*").eq("owner", ownerId).eq("year", year).maybeSingle();
  if (error) throw error;
  return data as YearTimelineHighlightRow | null;
}

/** 記念日（世帯共有）＋その年の注目すべき支出（大項目/小項目に整理・プライバシーマスク適用）
 * ＋本人の日記ハイライト（生成済みなら）を統合する。 */
export async function getYearTimeline(year: number, viewerProfileId: string): Promise<{ items: TimelineItem[]; highlightsGeneratedAt: string | null }> {
  const from = `${year}-01-01`;
  const toExclusive = `${year + 1}-01-01`;
  const [anniversaryRows, expenseRows, highlightRow] = await Promise.all([
    getAnniversaries(),
    getExpensesInRange(from, toExclusive),
    getYearTimelineHighlightRow(viewerProfileId, year),
  ]);

  const items: TimelineItem[] = [
    ...anniversariesInYear(anniversaryRows, year).map((a) => ({ date: a.date, kind: "anniversary" as const, title: a.name, description: a.text })),
    ...buildExpenseItems(expenseRows, viewerProfileId, highlightRow?.expense_clusters ?? []),
    ...(highlightRow?.items ?? []).map((h) => ({ date: h.date, kind: "diary" as const, title: h.title, description: h.description })),
  ];
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { items, highlightsGeneratedAt: highlightRow?.generated_at ?? null };
}

/** 本人の日記からAIでその年のハイライトを、支出の塊にはAIで見出しを付けて、次回以降は再生成するまでキャッシュを使う。 */
export async function generateYearTimelineHighlights(ownerId: string, year: number): Promise<YearTimelineHighlightRow> {
  const from = `${year}-01-01`;
  const toExclusive = `${year + 1}-01-01`;
  const [entries, expenseRows] = await Promise.all([getJournalEntriesInRange(ownerId, from, toExclusive), getExpensesInRange(from, toExclusive)]);

  const nonEmptyEntries = entries.filter((e) => e.body.trim());
  const items = nonEmptyEntries.length > 0 ? await extractYearHighlightsFromJournal(year, nonEmptyEntries.map((e) => ({ date: e.date, body: e.body }))) : [];

  const clusters = clusterExpenses(notableExpenseRows(expenseRows, ownerId)).filter((c) => c.length > 1);
  const titles =
    clusters.length > 0
      ? await titleExpenseClusters(clusters.map((c) => ({ category: c[0].category, from: c[0].date, to: c[c.length - 1].date, memos: c.map((e) => e.memo || e.category) })))
      : [];
  const expenseClusters: CachedExpenseCluster[] = clusters.map((c, i) => ({
    category: c[0].category,
    from: c[0].date,
    to: c[c.length - 1].date,
    title: titles[i] ?? fallbackClusterTitle(c),
  }));

  const { data, error } = await db()
    .from("year_timeline_highlights")
    .upsert({ owner: ownerId, year, items, expense_clusters: expenseClusters, generated_at: new Date().toISOString() }, { onConflict: "owner,year" })
    .select("*")
    .single();
  if (error) throw error;
  return data as YearTimelineHighlightRow;
}
