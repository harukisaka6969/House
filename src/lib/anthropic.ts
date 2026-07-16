import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// spec §2 / §8: サーバー側で claude-sonnet-4-6 を呼ぶ（現行版から踏襲）。
const MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  client = new Anthropic();
  return client;
}

function stripFence(text: string): string {
  return text.replace(/```json|```/g, "").trim();
}

function joinText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export interface OcrResult {
  date: string | null;
  store: string;
  total: number;
  category: string;
}

/** レシート画像 → {date, store, total, category}（現行版 ocrReceipt を移植） */
export async function ocrReceipt(base64: string, mediaType: string, categories: string[]): Promise<OcrResult> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 } },
          {
            type: "text",
            text: `このレシート画像を読み取り、次のJSONのみを返してください。前置きやコードブロックは不要です。
{"date":"YYYY-MM-DD（不明ならnull）","store":"店名","total":合計金額の数値,"category":"${categories.join("|")} のいずれか"}`,
          },
        ],
      },
    ],
  });
  const text = stripFence(joinText(res.content));
  return JSON.parse(text) as OcrResult;
}

export interface ParsedExpenseEntry {
  date?: string;
  account?: string;
  category?: string;
  amount?: number;
  memo?: string;
}

/** 文章 → 支出エントリ配列（現行版 parseExpenseText を移植。口座推定ルールは §8-2 準拠） */
export async function parseExpenseText(
  text: string,
  accounts: { id: string; name: string }[],
  categories: string[],
  todayStr: string
): Promise<ParsedExpenseEntry[]> {
  const acctList = accounts.map((a) => `${a.id}=${a.name}`).join(", ");
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `次の日本語の文章から家計簿の支出エントリを抽出し、JSON配列のみを返してください。前置きやコードブロックは不要です。複数の支出が含まれる場合は複数要素にしてください。
今日の日付: ${todayStr}（「昨日」等の相対表現はここから計算）
口座候補: ${acctList}。内容から最も適切な口座を選ぶこと（日常の生活必需品はa1、ローン返済はa2、趣味・娯楽・交際・レジャーはa3、投資関連はa4。判断がつかなければa1）。
カテゴリ候補: ${categories.join("|")}
形式: [{"date":"YYYY-MM-DD","account":"口座id","category":"カテゴリ","amount":金額の数値,"memo":"店名や品名"}]
文章: ${text}`,
      },
    ],
  });
  const t = stripFence(joinText(res.content));
  const arr = JSON.parse(t);
  return Array.isArray(arr) ? arr : [arr];
}

/** 家計アドバイザー。system はサーバーが§5準拠で構築したコンテキスト。 */
export async function runAdvisor(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1200,
    system,
    messages,
  });
  return joinText(res.content) || "回答を生成できませんでした。";
}

/** 銘柄・テーマのリサーチ（web_search有効）。現行版 runResearch を移植。 */
export async function runResearch(query: string): Promise<string> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `個人投資家向けに、次のテーマ・銘柄について最新情報を調べて日本語で簡潔にまとめてください。概要、直近の動向、代表的な投資手段（銘柄・ETF・投信など）、留意すべきリスクを含めてください。特定の売買推奨はせず、事実ベースで。

テーマ: ${query}`,
      },
    ],
    tools: [{ type: "web_search_20260209", name: "web_search" }],
  });
  return joinText(res.content) || "結果を取得できませんでした。";
}
