import "server-only";
import { db } from "./db";
import { getExpensesInRange } from "./expenses";
import { getJournalEntriesInRange } from "./journal";
import { isMaskedForViewer } from "./aggregate";
import { extractYearHighlightsFromJournal, titleExpenseClusters } from "./anthropic";
import { clusterExpenses, fallbackClusterTitle } from "./expenseCluster";
import { DASHBOARD_MIN_MONTH } from "./date";
import type { ExpenseRow } from "./types";

/** DASHBOARD_MIN_MONTHの初日（YYYY-MM-01）。それより前のタイムライン項目は履歴として
 * DBには残すが、ダッシュボードには表示しない。 */
const DASHBOARD_MIN_DATE = `${DASHBOARD_MIN_MONTH}-01`;

const NOTABLE_CATEGORY = "旅行";
const NOTABLE_AMOUNT_THRESHOLD = 30000;
const MAJOR_AMOUNT_THRESHOLD = 100000;

/** 家賃・水道光熱・通信のような「毎月出ていくだけの支払い」は、金額が大きくても
 * タイムラインに載せる「出来事」ではないため常に除外する。 */
const ROUTINE_CATEGORIES = new Set(["住居", "水道光熱", "通信"]);
/** 過去の家計簿からまとめて取り込んだ月次集計（実際の1回の出来事ではない）を除外するための目印。 */
const BULK_IMPORT_MEMO_MARKER = "旧家計簿より";

/** 「大きな出来事」候補として意味のある支出か（定期支払い・非公開・住居費等の生活固定費・
 * 旧家計簿からの月次集計はすべて対象外）。 */
function isEventWorthyExpense(e: ExpenseRow, viewerProfileId: string): boolean {
  return (
    e.source !== "recurring" &&
    !isMaskedForViewer(e, viewerProfileId) &&
    !ROUTINE_CATEGORIES.has(e.category) &&
    !e.memo.includes(BULK_IMPORT_MEMO_MARKER)
  );
}

export interface TimelineChild {
  date: string;
  title: string;
  amount: number;
}

export interface TimelineItem {
  date: string;
  kind: "expense" | "diary";
  title: string;
  description: string;
  amount?: number;
  children?: TimelineChild[];
  major?: boolean;
}

interface CachedExpenseCluster {
  category: string;
  from: string;
  to: string;
  title: string;
}

interface CachedHighlight {
  date: string;
  title: string;
  description: string;
  importance?: "major" | "normal";
}

export interface YearTimelineHighlightRow {
  id: string;
  owner: string;
  year: number;
  items: CachedHighlight[];
  expense_clusters: CachedExpenseCluster[];
  generated_at: string;
}

/** 定期支払い・生活固定費・旧家計簿の月次集計を除外し、旅行カテゴリか高額な支出だけを拾う（日付昇順）。 */
function notableExpenseRows(rows: ExpenseRow[], viewerProfileId: string): ExpenseRow[] {
  return rows
    .filter((e) => isEventWorthyExpense(e, viewerProfileId))
    .filter((e) => e.category === NOTABLE_CATEGORY || e.amount >= NOTABLE_AMOUNT_THRESHOLD)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 支出の塊を大項目（複数件なら子に個々の支出、単発ならそのまま）のタイムライン項目にする。
 * 合計金額がMAJOR_AMOUNT_THRESHOLD以上なら振り返り時に目立つよう major フラグを立てる。 */
function buildExpenseItems(rows: ExpenseRow[], viewerProfileId: string, cachedClusters: CachedExpenseCluster[]): TimelineItem[] {
  const clusters = clusterExpenses(notableExpenseRows(rows, viewerProfileId));
  return clusters.map((cluster) => {
    const from = cluster[0].date;
    const to = cluster[cluster.length - 1].date;
    const cached =
      cluster.length > 1 ? cachedClusters.find((c) => c.category === cluster[0].category && c.from === from && c.to === to) : undefined;
    const amount = cluster.reduce((s, e) => s + e.amount, 0);
    return {
      date: from,
      kind: "expense" as const,
      title: cached?.title ?? fallbackClusterTitle(cluster),
      description: cluster[0].category,
      amount,
      children: cluster.length > 1 ? cluster.map((e) => ({ date: e.date, title: e.memo || e.category, amount: e.amount })) : undefined,
      major: amount >= MAJOR_AMOUNT_THRESHOLD,
    };
  });
}

async function getYearTimelineHighlightRow(ownerId: string, year: number): Promise<YearTimelineHighlightRow | null> {
  const { data, error } = await db().from("year_timeline_highlights").select("*").eq("owner", ownerId).eq("year", year).maybeSingle();
  if (error) throw error;
  return data as YearTimelineHighlightRow | null;
}

/** その年の注目すべき支出（大項目/小項目に整理・プライバシーマスク適用）＋本人の日記ハイライト
 * （生成済みなら）を統合する。記念日は「起きた出来事」ではないためここには含めない。 */
export async function getYearTimeline(year: number, viewerProfileId: string): Promise<{ items: TimelineItem[]; highlightsGeneratedAt: string | null }> {
  const from = `${year}-01-01`;
  const toExclusive = `${year + 1}-01-01`;
  const [expenseRows, highlightRow] = await Promise.all([
    getExpensesInRange(from, toExclusive),
    getYearTimelineHighlightRow(viewerProfileId, year),
  ]);

  const items: TimelineItem[] = [
    ...buildExpenseItems(expenseRows, viewerProfileId, highlightRow?.expense_clusters ?? []),
    ...(highlightRow?.items ?? []).map((h) => ({
      date: h.date,
      kind: "diary" as const,
      title: h.title,
      description: h.description,
      major: h.importance === "major",
    })),
  ].filter((item) => item.date >= DASHBOARD_MIN_DATE);
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { items, highlightsGeneratedAt: highlightRow?.generated_at ?? null };
}

/** 本人の日記からAIでその年のハイライトを、支出の塊にはAIで見出しを付けて、次回以降は再生成するまでキャッシュを使う。
 * 日記の抽出には、その日の支出メモも参考情報として添える（旅行・お祭りなどを見分けやすくするため）。 */
export async function generateYearTimelineHighlights(ownerId: string, year: number): Promise<YearTimelineHighlightRow> {
  const from = `${year}-01-01`;
  const toExclusive = `${year + 1}-01-01`;
  const [entries, expenseRows] = await Promise.all([getJournalEntriesInRange(ownerId, from, toExclusive), getExpensesInRange(from, toExclusive)]);

  const expenseNotesByDate = new Map<string, string[]>();
  for (const e of expenseRows) {
    if (!isEventWorthyExpense(e, ownerId)) continue;
    const list = expenseNotesByDate.get(e.date) ?? [];
    list.push(`${e.memo || e.category}(${e.amount}円)`);
    expenseNotesByDate.set(e.date, list);
  }

  const nonEmptyEntries = entries.filter((e) => e.body.trim());
  const items =
    nonEmptyEntries.length > 0
      ? await extractYearHighlightsFromJournal(
          year,
          nonEmptyEntries.map((e) => ({ date: e.date, body: e.body, expenseNote: expenseNotesByDate.get(e.date)?.join("、") }))
        )
      : [];

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
