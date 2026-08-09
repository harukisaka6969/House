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
  buildPrompt: (recentContents: string[], todayStr: string) => string;
}

function avoidRepeatClause(recentContents: string[]): string {
  if (recentContents.length === 0) return "";
  const recent = recentContents.slice(0, 10).map((c, i) => `${i + 1}. ${c.slice(0, 80)}...`).join("\n");
  return `\n\n直近に送った内容（この内容と同じ切り口・テーマは避けて、必ず違う内容にしてください）:\n${recent}`;
}

const COMMON_RULE = "前置きや「以下にまとめます」のような言葉は不要です。本文のみを返してください。絵文字は使っても構いませんが多用しないでください。";

export const TIP_DEFS: TipDef[] = [
  {
    category: "news",
    time: "09:00",
    label: "📰 昨日のニュースダイジェスト",
    useWebSearch: true,
    buildPrompt: (recent, today) => {
      const yesterday = prevDayStr(today);
      return `あなたは日本語のニュースダイジェストを書くライターです。web検索を使って、${yesterday}（${today}の前日）に日本国内外で報じられた重要なニュースの中から、家庭の生活に影響を与えるもの（物価・金利・税制・天候や災害・生活インフラなど）や、ビジネス・経済への影響が大きいものを中心に選び、2分程度で読める分量（800〜1000文字程度）の日本語のダイジェストとして自然な文章でまとめてください。箇条書きは使わず、読み物として自然につながる文章にしてください。${COMMON_RULE}${avoidRepeatClause(recent)}`;
    },
  },
  {
    category: "health",
    time: "12:00",
    label: "💪 健康Tips",
    useWebSearch: false,
    buildPrompt: (recent) =>
      `あなたは筋トレ・食事・栄養の専門家です。そのいずれかについて、今日から実践できる具体的なワンポイントアドバイスを日本語で3文程度にまとめてください。${COMMON_RULE}${avoidRepeatClause(recent)}`,
  },
  {
    category: "money",
    time: "15:00",
    label: "💰 お金Tips",
    useWebSearch: false,
    buildPrompt: (recent) =>
      `あなたはお金の専門家です。お金の使い方・投資・稼ぎ方・節約のいずれかについて、実践的なワンポイントアドバイスを日本語で3文程度にまとめてください。${COMMON_RULE}${avoidRepeatClause(recent)}`,
  },
  {
    category: "philosophy",
    time: "18:00",
    label: "🪶 今日の哲学",
    useWebSearch: false,
    buildPrompt: (recent) =>
      `あなたは哲学者です。人生において非常に重要な問い、または考えることで人生にプラスになる哲学的な視点を1つ選び、日本語で5〜6文程度、じっくりと掘り下げて伝えてください。読んだ人が今日、少し立ち止まって考えたくなるような深さのある内容にしてください。${COMMON_RULE}${avoidRepeatClause(recent)}`,
  },
  {
    category: "wellbeing",
    time: "21:00",
    label: "🌿 ウェルビーイングTips",
    useWebSearch: false,
    buildPrompt: (recent) =>
      `あなたはメンタルヘルス・ウェルビーイングの専門家です。精神的な健康について、今日から実践できる具体的なワンポイントアドバイスを日本語で3文程度にまとめてください。${COMMON_RULE}${avoidRepeatClause(recent)}`,
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

async function getRecentContents(category: TipCategory, limit = 10): Promise<string[]> {
  const { data, error } = await db().from("line_daily_tips").select("content").eq("category", category).order("date", { ascending: false }).limit(limit);
  if (error) throw error;
  return ((data ?? []) as { content: string }[]).map((r) => r.content);
}

async function recordTip(category: TipCategory, date: string, content: string): Promise<void> {
  const { error } = await db().from("line_daily_tips").insert({ category, date, content });
  if (error) throw error;
}

/** 指定のtip定義について本文を生成し、送信履歴に記録する（送信自体は呼び出し側で行う）。 */
export async function generateAndRecordTip(def: TipDef, today: string): Promise<string> {
  const recent = await getRecentContents(def.category);
  const prompt = def.buildPrompt(recent, today);
  const content = await generateDailyTip(prompt, def.useWebSearch);
  await recordTip(def.category, today, content);
  return content;
}
