import "server-only";
import { db } from "./db";
import { getAnniversaries } from "./anniversaries";
import { anniversariesInYear } from "./anniversaryMath";
import { getExpensesInRange } from "./expenses";
import { getJournalEntriesInRange } from "./journal";
import { isMaskedForViewer } from "./aggregate";
import { extractYearHighlightsFromJournal } from "./anthropic";
import type { ExpenseRow } from "./types";

const NOTABLE_CATEGORY = "旅行";
const NOTABLE_AMOUNT_THRESHOLD = 30000;

export interface TimelineItem {
  date: string;
  kind: "anniversary" | "expense" | "diary";
  title: string;
  description: string;
  amount?: number;
}

export interface YearTimelineHighlightRow {
  id: string;
  owner: string;
  year: number;
  items: { date: string; title: string; description: string }[];
  generated_at: string;
}

/** 定期支払いは「大きな出来事」ではないため除外し、旅行カテゴリか高額な支出だけを拾う。 */
function notableExpenseItems(rows: ExpenseRow[], viewerProfileId: string): TimelineItem[] {
  return rows
    .filter((e) => e.source !== "recurring" && !isMaskedForViewer(e, viewerProfileId))
    .filter((e) => e.category === NOTABLE_CATEGORY || e.amount >= NOTABLE_AMOUNT_THRESHOLD)
    .map((e) => ({
      date: e.date,
      kind: "expense" as const,
      title: e.memo || e.category,
      description: e.category,
      amount: e.amount,
    }));
}

async function getYearTimelineHighlightRow(ownerId: string, year: number): Promise<YearTimelineHighlightRow | null> {
  const { data, error } = await db().from("year_timeline_highlights").select("*").eq("owner", ownerId).eq("year", year).maybeSingle();
  if (error) throw error;
  return data as YearTimelineHighlightRow | null;
}

/** 記念日（世帯共有）＋その年の注目すべき支出（プライバシーマスク適用）＋本人の日記ハイライト（生成済みなら）を統合する。 */
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
    ...notableExpenseItems(expenseRows, viewerProfileId),
    ...(highlightRow?.items ?? []).map((h) => ({ date: h.date, kind: "diary" as const, title: h.title, description: h.description })),
  ];
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { items, highlightsGeneratedAt: highlightRow?.generated_at ?? null };
}

/** 本人の日記からAIでその年のハイライトを抜き出し、次回以降は再生成するまでキャッシュを使う。 */
export async function generateYearTimelineHighlights(ownerId: string, year: number): Promise<YearTimelineHighlightRow> {
  const from = `${year}-01-01`;
  const toExclusive = `${year + 1}-01-01`;
  const entries = await getJournalEntriesInRange(ownerId, from, toExclusive);
  const nonEmpty = entries.filter((e) => e.body.trim());
  const items = nonEmpty.length > 0 ? await extractYearHighlightsFromJournal(year, nonEmpty.map((e) => ({ date: e.date, body: e.body }))) : [];
  const { data, error } = await db()
    .from("year_timeline_highlights")
    .upsert({ owner: ownerId, year, items, generated_at: new Date().toISOString() }, { onConflict: "owner,year" })
    .select("*")
    .single();
  if (error) throw error;
  return data as YearTimelineHighlightRow;
}
