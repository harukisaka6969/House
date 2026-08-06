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

export interface MealEstimate {
  description: string;
  calories: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

export type LinePhotoKind = "meal" | "receipt" | "other";

/** LINEに送られてきた写真が「食事」か「レシート」かそれ以外かを判定する（自動振り分け用）。 */
export async function classifyLinePhoto(base64: string, mediaType: string): Promise<LinePhotoKind> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 10,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 } },
          {
            type: "text",
            text: "この画像は「食事・料理の写真」「レシート・領収書」「それ以外」のどれですか。meal / receipt / other のいずれか1単語のみを返してください。",
          },
        ],
      },
    ],
  });
  const text = stripFence(joinText(res.content)).toLowerCase();
  if (text.includes("meal")) return "meal";
  if (text.includes("receipt")) return "receipt";
  return "other";
}

export type LineTextIntent = "meal" | "expense" | "income" | "unknown";

/** LINEに送られてきた文章メッセージが「食事」「支出」「収入」のどれについての話かを判定する（自動振り分け用）。 */
export async function classifyLineText(text: string): Promise<LineTextIntent> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 10,
    messages: [
      {
        role: "user",
        content: `次のメッセージは「食事の内容」「支出（買い物などお金を使った内容）」「収入（お金が入った内容）」「それ以外」のどれに一番近いですか。meal / expense / income / unknown のいずれか1単語のみを返してください。\nメッセージ: ${text}`,
      },
    ],
  });
  const t = stripFence(joinText(res.content)).toLowerCase();
  if (t.includes("meal")) return "meal";
  if (t.includes("expense")) return "expense";
  if (t.includes("income")) return "income";
  return "unknown";
}

export interface ParsedIncomeEntry {
  name: string;
  amount: number;
}

/** 文章 → 収入エントリ（名前・金額）。LINEからの収入登録用。 */
export async function extractIncomeFromText(text: string): Promise<ParsedIncomeEntry> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `次の文章から収入の内容を抽出し、次のJSONのみを返してください。前置きやコードブロックは不要です。
{"name":"収入の名前（給料、副業、ボーナスなど。20文字程度）","amount":金額の数値}
文章: ${text}`,
      },
    ],
  });
  const t = stripFence(joinText(res.content));
  return JSON.parse(t) as ParsedIncomeEntry;
}

/** 食事写真 → {description, calories, protein_g, fat_g, carb_g}。大まかな推定であることを前提とする。 */
export async function estimateMealNutrition(base64: string, mediaType: string): Promise<MealEstimate> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 } },
          {
            type: "text",
            text: `この食事の写真から、内容とおおよその栄養価を推定してください。厳密な計測ではなく大まかな目安でよいので、必ず数値を返してください。次のJSONのみを返してください。前置きやコードブロックは不要です。
{"description":"料理名や内容の簡潔な説明（15文字程度）","calories":総カロリーの数値(kcal),"protein_g":タンパク質の数値(g),"fat_g":脂質の数値(g),"carb_g":炭水化物の数値(g)}`,
          },
        ],
      },
    ],
  });
  const text = stripFence(joinText(res.content));
  return JSON.parse(text) as MealEstimate;
}

/** 食事の文章の説明 → {description, calories, protein_g, fat_g, carb_g}。写真が無いときのテキスト入力用。 */
export async function estimateMealNutritionFromText(description: string): Promise<MealEstimate> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `次の食事の説明から、内容とおおよその栄養価を推定してください。厳密な計測ではなく大まかな目安でよいので、必ず数値を返してください。次のJSONのみを返してください。前置きやコードブロックは不要です。
{"description":"料理名や内容の簡潔な説明（15文字程度）","calories":総カロリーの数値(kcal),"protein_g":タンパク質の数値(g),"fat_g":脂質の数値(g),"carb_g":炭水化物の数値(g)}
食事の説明: ${description}`,
      },
    ],
  });
  const text = stripFence(joinText(res.content));
  return JSON.parse(text) as MealEstimate;
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

export interface ExtractedRecord {
  category: string;
  date: string | null;
  title: string;
  metrics: { label: string; value: string }[];
}

function recordCategoryHint(existingCategories: string[]): string {
  return existingCategories.length > 0
    ? `既存のカテゴリ: ${existingCategories.join("、")}。内容が既存カテゴリのいずれかと明らかに同じ種類の記録であれば、そのカテゴリ名をそのまま使ってください（表記ゆれを作らない）。どれにも当てはまらなければ、短く分かりやすい新しいカテゴリ名を考えてください（例: 体組成、ランニング、ボルダリング、水泳 など）。`
    : `カテゴリが未登録なので、内容から短く分かりやすいカテゴリ名を考えてください（例: 体組成、ランニング、ボルダリング、水泳 など）。`;
}

function parseExtractedRecord(text: string): ExtractedRecord {
  const parsed = JSON.parse(stripFence(text)) as ExtractedRecord;
  return {
    category: (parsed.category || "その他").trim(),
    date: parsed.date ?? null,
    title: (parsed.title || "").trim(),
    metrics: Array.isArray(parsed.metrics) ? parsed.metrics.filter((m) => m && typeof m.label === "string" && typeof m.value === "string") : [],
  };
}

const RECORD_JSON_FORMAT =
  '{"category":"カテゴリ名","date":"YYYY-MM-DD（分かればそれ、無ければnull）","title":"この記録の短いタイトル（15文字程度、例: 体組成測定、皇居5km走）","metrics":[{"label":"項目名","value":"値（単位込みでよい。例: 84.1kg、29.1、5:12/km）"}]}';

/** 任意の「記録」の写真（体組成計・ランニングアプリ・ボルダリングの記録など何でもよい）から、
 * カテゴリ・日付・タイトル・項目一覧を抽出する。既存カテゴリに明らかに一致すればそれを再利用し、
 * カテゴリが乱立しないようにする。 */
export async function extractRecordFromPhoto(base64: string, mediaType: string, existingCategories: string[]): Promise<ExtractedRecord> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 } },
          {
            type: "text",
            text: `この画像は、体組成計の測定結果・ランニングアプリの記録・ボルダリングの記録など、何らかの個人の記録です。画像から読み取れる情報をもとに、次のJSONのみを返してください。前置きやコードブロックは不要です。
${recordCategoryHint(existingCategories)}
${RECORD_JSON_FORMAT}
画像から読み取れる主要な数値・項目はできるだけ全てmetricsに含めてください。文字や数値がほとんど読み取れない画像なら、metricsは空配列にしてください。`,
          },
        ],
      },
    ],
  });
  return parseExtractedRecord(joinText(res.content));
}

/** 任意の「記録」の文章での説明（写真が無いとき）から、カテゴリ・日付・タイトル・項目一覧を抽出する。 */
export async function extractRecordFromText(text: string, existingCategories: string[], todayStr: string): Promise<ExtractedRecord> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: `次の文章は、体組成の測定結果・ランニングの記録・ボルダリングの記録など、何らかの個人の記録の説明です。内容から読み取れる情報をもとに、次のJSONのみを返してください。前置きやコードブロックは不要です。
今日の日付: ${todayStr}（文中に日付が無ければこれを使う。「昨日」等の相対表現や「8/5」のような月日のみの表記は、ここを基準に計算・補完すること）
${recordCategoryHint(existingCategories)}
${RECORD_JSON_FORMAT}
文章から読み取れる主要な数値・項目はできるだけ全てmetricsに含めてください。
記録の説明: ${text}`,
      },
    ],
  });
  return parseExtractedRecord(joinText(res.content));
}

/** 日次・週次ダイジェスト（前日/先週のまとめ）を生成する。promptはlib/digestContext.tsで構築したもの。 */
export async function generateDigest(prompt: string, maxTokens: number): Promise<string> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return joinText(res.content).trim() || "まとめを生成できませんでした。";
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
