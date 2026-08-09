import "server-only";
import { db } from "./db";
import { generateDailyTip } from "./anthropic";
import { prevDayStr } from "./date";

export type TipCategory = "news" | "health" | "money" | "philosophy" | "wellbeing";

export interface TipDef {
  category: TipCategory;
  time: string; // "HH:MM" (JST)
  label: string;
  useWebSearch: boolean;
  buildPrompt: (recentFull: string[], olderSummaries: string[], todayStr: string) => string;
}

/** 重複回避の文脈: 直近RECENT_FULL_LIMIT件は本文そのもの、それより古い分はsummaryだけを渡す。
 * 本文全部を無期限に渡すとプロンプトが際限なく膨らむため、古い分は要約に圧縮して
 * 実質「同じカテゴリの全履歴」を範囲にしつつプロンプトサイズを抑える。 */
function avoidRepeatClause(recentFull: string[], olderSummaries: string[]): string {
  if (recentFull.length === 0 && olderSummaries.length === 0) return "";
  const parts: string[] = [];
  if (recentFull.length > 0) {
    parts.push(`直近に送った内容（同じ切り口・テーマは避けて、必ず違う内容にしてください）:\n${recentFull.map((c, i) => `${i + 1}. ${c.slice(0, 80)}...`).join("\n")}`);
  }
  if (olderSummaries.length > 0) {
    parts.push(`それ以前に扱ったテーマの一覧（同じテーマの繰り返しは避けてください）:\n${olderSummaries.join(" / ")}`);
  }
  return `\n\n${parts.join("\n\n")}`;
}

/** web検索などツールを使った後、モデルが最終回答の直前に「情報が集まりました」等の地の文を
 * 挟むことがあり、プロンプトで禁止するだけでは防ぎきれないため、本文をタグで囲んで確実に抽出する。 */
const COMMON_RULE =
  "本文の直前や直後に、前置き・作成プロセスの説明・「以下にまとめます」のような言葉は一切書かないでください。回答は必ず本文だけを <output> と </output> のタグで囲んで出力し、そのすぐ後に、今日扱ったテーマを15字程度で要約したものを <summary> と </summary> のタグで囲んで出力してください（タグの外には何も書かないこと）。絵文字は使っても構いませんが多用しないでください。";

function extractTag(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return (match ? match[1] : "").trim();
}

export const TIP_DEFS: TipDef[] = [
  {
    category: "news",
    time: "09:00",
    label: "📰 昨日のニュースダイジェスト",
    useWebSearch: true,
    buildPrompt: (recentFull, olderSummaries, today) => {
      const yesterday = prevDayStr(today);
      return `あなたは日本語のニュースダイジェストを書くライターです。web検索を使って、${yesterday}（${today}の前日）に日本国内外で報じられた重要なニュースの中から、家庭の生活に影響を与えるもの（物価・金利・税制・天候や災害・生活インフラなど）や、ビジネス・経済への影響が大きいものを中心に選び、2分程度で読める分量（800〜1000文字程度）の日本語のダイジェストとして自然な文章でまとめてください。箇条書きは使わず、読み物として自然につながる文章にしてください。検索中である旨や「検索結果をもとに作成します」のような、作成プロセスに関する言葉は一切含めないでください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`;
    },
  },
  {
    category: "health",
    time: "12:00",
    label: "💪 健康Tips",
    useWebSearch: false,
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたは筋トレ・食事・栄養の専門家です。そのいずれかについて、今日から実践できる具体的なワンポイントアドバイスを日本語で3文程度にまとめてください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
  {
    category: "money",
    time: "15:00",
    label: "💰 お金Tips",
    useWebSearch: false,
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたはお金の専門家です。お金の使い方・投資・稼ぎ方・節約のいずれかについて、実践的なワンポイントアドバイスを日本語で3文程度にまとめてください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
  {
    category: "philosophy",
    time: "18:00",
    label: "🪶 今日の哲学",
    useWebSearch: false,
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたは哲学者です。人生において非常に重要な問い、または考えることで人生にプラスになる哲学的な視点を1つ選び、日本語で5〜6文程度、じっくりと掘り下げて伝えてください。読んだ人が今日、少し立ち止まって考えたくなるような深さのある内容にしてください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
  {
    category: "wellbeing",
    time: "21:00",
    label: "🌿 ウェルビーイングTips",
    useWebSearch: false,
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたはメンタルヘルス・ウェルビーイングの専門家です。精神的な健康について、今日から実践できる具体的なワンポイントアドバイスを日本語で3文程度にまとめてください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
];

export function tipsDueForTime(hhmm: string): TipDef[] {
  return TIP_DEFS.filter((t) => t.time === hhmm);
}

export async function hasTipSentToday(category: TipCategory, date: string): Promise<boolean> {
  const { data, error } = await db().from("line_daily_tips").select("id").eq("category", category).eq("date", date).maybeSingle();
  if (error) throw error;
  return !!data;
}

const RECENT_FULL_LIMIT = 8;
const OLDER_SUMMARY_LIMIT = 500;

/** 直近RECENT_FULL_LIMIT件は本文、それ以前はOLDER_SUMMARY_LIMIT件までsummaryだけを取得する
 * （カテゴリごとに独立。他カテゴリの内容とは比較しない）。 */
async function getAntiRepeatContext(category: TipCategory): Promise<{ recentFull: string[]; olderSummaries: string[] }> {
  const { data, error } = await db()
    .from("line_daily_tips")
    .select("content, summary")
    .eq("category", category)
    .order("date", { ascending: false })
    .limit(RECENT_FULL_LIMIT + OLDER_SUMMARY_LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as { content: string; summary: string }[];
  return {
    recentFull: rows.slice(0, RECENT_FULL_LIMIT).map((r) => r.content),
    olderSummaries: rows.slice(RECENT_FULL_LIMIT).map((r) => r.summary).filter(Boolean),
  };
}

async function recordTip(category: TipCategory, date: string, content: string, summary: string): Promise<void> {
  const { error } = await db().from("line_daily_tips").insert({ category, date, content, summary });
  if (error) throw error;
}

/** 指定のtip定義について本文を生成し、送信履歴に記録する（送信自体は呼び出し側で行う）。 */
export async function generateAndRecordTip(def: TipDef, today: string): Promise<string> {
  const { recentFull, olderSummaries } = await getAntiRepeatContext(def.category);
  const prompt = def.buildPrompt(recentFull, olderSummaries, today);
  const raw = await generateDailyTip(prompt, def.useWebSearch);
  const content = extractTag(raw, "output") || raw.trim();
  const summary = extractTag(raw, "summary") || content.slice(0, 30);
  await recordTip(def.category, today, content, summary);
  return content;
}
