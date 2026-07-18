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

/** 入力中の項目（品名・メモ等）からカテゴリを推測する。フォームのどこからでも呼べる軽量な分類専用API。 */
export async function suggestCategory(text: string, options: string[] | null): Promise<string> {
  const instruction =
    options && options.length > 0
      ? `次の候補の中から最も適切なものを1つだけ選んでください: ${options.join("|")}`
      : `内容にふさわしい短い日本語のカテゴリ名を1つ考えてください（例: 食品、日用品、ペット用品 など。長い説明は不要）。`;
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 30,
    messages: [
      {
        role: "user",
        content: `次の内容を分類してください。${instruction}\n回答はカテゴリ名のみを1行で返してください。前置き・記号・引用符・説明は一切不要です。\n内容: ${text}`,
      },
    ],
  });
  const raw = joinText(res.content).trim();
  const cleaned = raw.split("\n")[0].replace(/^["「『]+|["」』]+$/g, "").trim();
  if (options && options.length > 0) {
    return options.find((o) => o === cleaned) ?? options.find((o) => cleaned.includes(o)) ?? options[options.length - 1];
  }
  return cleaned || "その他";
}

/** その日の支出一覧から日記の下書き文章を作る。日記が空のときの自動下書き用。 */
export async function draftJournalFromExpenses(
  dateStr: string,
  expenses: { category: string; amount: number; memo: string }[]
): Promise<string> {
  const lines = expenses.map((e) => `- ${e.category} ${e.amount}円${e.memo ? `（${e.memo}）` : ""}`).join("\n");
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `次は${dateStr}に記録された支出の一覧です。これをもとに、その日にあったことを想像した自然な日本語の日記文（2〜4文、体言止めや箇条書きではなく普通の文章）を書いてください。金額を文中にそのまま書く必要はありません。前置きや説明、タイトルは不要で、日記本文のみを返してください。\n\n${lines}`,
      },
    ],
  });
  return joinText(res.content).trim();
}

/** 日記本文から、お金を使った・受け取ったことに関係する記述だけを短く抜き出す（分類の前段）。関係する記述がなければ空配列。 */
export async function extractMoneyMentions(text: string): Promise<string[]> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `次の日記本文から、その日お金を使った・受け取ったことに関係する記述だけを、元の文をもとに1件ずつ短く抜き出してください。世間話・感想・天気・体調などお金に無関係な部分は含めないでください。該当する記述が一つもなければ空配列を返してください。
JSON配列のみを返してください（例: ["カフェで800円払った", "友達に3000円貸した"]）。前置きやコードブロックは不要です。
日記本文: ${text}`,
      },
    ],
  });
  const t = stripFence(joinText(res.content));
  try {
    const arr = JSON.parse(t);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export interface ExtractedMoneyEvent {
  category?: string;
  account?: string;
  amount?: number;
  memo?: string;
}

/** お金に関係する記述（extractMoneyMentionsの抜き出し結果など）を、口座・カテゴリ・金額に分類する。 */
export async function extractExpensesFromJournal(
  text: string,
  accounts: { id: string; name: string }[],
  categories: string[]
): Promise<ExtractedMoneyEvent[]> {
  const acctList = accounts.map((a) => `${a.id}=${a.name}`).join(", ");
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `次の日記本文から、その日実際にお金を使った出来事だけを抽出し、JSON配列のみを返してください。前置きやコードブロックは不要です。
金額がはっきり書かれていない場合は、内容から常識的な金額を推測してください（多少の誤差は許容されます、推測できたら必ず金額を入れてください）。お金の動きが全くない内容なら空配列 [] を返してください。
口座候補: ${acctList}。内容から最も適切な口座を選ぶこと（日常の生活必需品はa1、ローン返済はa2、趣味・娯楽・交際・レジャーはa3、投資関連はa4。判断がつかなければa1）。
カテゴリ候補: ${categories.join("|")}
形式: [{"account":"口座id","category":"カテゴリ","amount":金額の数値,"memo":"内容の要約（10文字程度）"}]
日記本文: ${text}`,
      },
    ],
  });
  const t = stripFence(joinText(res.content));
  try {
    const arr = JSON.parse(t);
    return Array.isArray(arr) ? arr : [arr];
  } catch {
    return [];
  }
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
