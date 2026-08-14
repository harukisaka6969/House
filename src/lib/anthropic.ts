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

/** 口座推定ルール（parseExpenseText / extractExpensesFromJournal / ocrReceipt で共通利用）。
 * 外食は、普段の値段の必須の食事（朝食・昼食・夕食）はa1、それ以外（高額な食事・カフェ・喫茶店・
 * 間食やデザート・飲み会など嗜好性の高いもの）はa3として扱う。 */
function accountRuleText(acctList: string): string {
  return `口座候補: ${acctList}。内容から最も適切な口座を選ぶこと（日常の生活必需品はa1、ローン返済はa2、趣味・娯楽・交際・レジャーはa3、投資関連はa4。外食は、普段の値段の必須の食事（朝食・昼食・夕食）ならa1、それ以外（高額な食事、カフェ・喫茶店、間食・デザート、飲み会など嗜好性の高いもの）はa3として扱うこと。判断がつかなければa1）。`;
}

export interface OcrResult {
  date: string | null;
  store: string;
  total: number;
  category: string;
  account?: string;
  /** レシートに記載の通貨のISO 4217コード（例: USD, EUR, KRW）。日本円なら"JPY"。
   * totalは常にこの通貨での金額そのもの（円への換算はサーバーが別途行うため、AIは換算しない）。 */
  currency: string;
  /** レシートに割引（○%OFF、定価と割引後価格の併記など）が読み取れる場合のみ割引率(%)。読み取れなければnull。
   * 節約額そのものはAIに計算させず、サーバー側でtotal（支払額）とこの割引率から逆算する。 */
  discount_percent: number | null;
}

/** レシート画像 → {date, store, total, category, account, currency, discount_percent}（現行版 ocrReceipt を移植） */
export async function ocrReceipt(
  base64: string,
  mediaType: string,
  categories: string[],
  accounts: { id: string; name: string }[]
): Promise<OcrResult> {
  const acctList = accounts.map((a) => `${a.id}=${a.name}`).join(", ");
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
${accountRuleText(acctList)}
海外のレシート（日本円以外の通貨）の場合、totalはレシートに印字された金額そのままの数値にしてください（円への換算は絶対に行わないでください。換算は別のシステムが行います）。currencyにはISO 4217の3文字コード（例: USD, EUR, KRW）を入れてください。日本円のレシートならcurrencyは"JPY"にしてください。
レシートに「○%OFF」「定価○○円→○○円」のような割引の表示がある場合は、discount_percentにその割引率（0〜99の数値）を入れてください。割引の表示が無ければdiscount_percentはnullにしてください。割引額そのものの計算は不要です（率だけでよい）。
{"date":"YYYY-MM-DD（不明ならnull）","store":"店名","total":合計金額の数値（レシート記載通貨のまま、換算しない）,"category":"${categories.join("|")} のいずれか","account":"口座id","currency":"ISO 4217コード。日本円なら\\"JPY\\"","discount_percent":割引率の数値、読み取れなければnull}`,
          },
        ],
      },
    ],
  });
  const text = stripFence(joinText(res.content));
  const parsed = JSON.parse(text) as Partial<OcrResult>;
  const discount = Number(parsed.discount_percent);
  return {
    ...parsed,
    currency: (parsed.currency || "JPY").toUpperCase(),
    discount_percent: Number.isFinite(discount) && discount > 0 && discount < 100 ? discount : null,
  } as OcrResult;
}

export interface ParsedExpenseEntry {
  date?: string;
  account?: string;
  category?: string;
  amount?: number;
  memo?: string;
  /** 海外通貨での支出と読み取れた場合のISO 4217コード（例: USD）。日本円ならJPYまたは省略。
   * amountはこの通貨での金額そのもの（円への換算はサーバーが行うため、AIは換算しない）。 */
  currency?: string;
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
${accountRuleText(acctList)}
カテゴリ候補: ${categories.join("|")}
海外通貨（ドル・ユーロ・ウォンなど）での支出と読み取れる場合、amountはその通貨での金額そのままにしてください（円への換算は絶対に行わないでください。換算は別のシステムが行います）。currencyにISO 4217の3文字コード（例: USD, EUR, KRW）を入れてください。日本円ならcurrencyは省略するか"JPY"にしてください。
形式: [{"date":"YYYY-MM-DD","account":"口座id","category":"カテゴリ","amount":金額の数値（外貨ならその通貨のまま、換算しない）,"memo":"店名や品名","currency":"外貨の場合のみISO 4217コード"}]
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
${accountRuleText(acctList)}
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

export type LineTextIntent = "meal" | "expense" | "income" | "smarthome" | "savings" | "unknown";

/** LINEに送られてきた文章メッセージが「食事」「支出」「収入」「家電操作」「節約アクション」のどれについての話かを判定する（自動振り分け用）。 */
export async function classifyLineText(text: string): Promise<LineTextIntent> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 10,
    messages: [
      {
        role: "user",
        content: `次のメッセージは「食事の内容」「支出（単に買い物などお金を使った内容）」「収入（お金が入った内容）」「家電の操作やシーンの実行（照明・エアコン・鍵など）」「節約アクション（工夫して支出を抑えた・安く買った・ポイントを使ったなど、節約につながる行動の報告）」「それ以外」のどれに一番近いですか。単なる買い物の報告はexpense、割引で買った・自炊で節約した・ポイントで支払ったなど「工夫して安くした」という要素があればsavingsです。meal / expense / income / smarthome / savings / unknown のいずれか1単語のみを返してください。\nメッセージ: ${text}`,
      },
    ],
  });
  const t = stripFence(joinText(res.content)).toLowerCase().replace(/\s+/g, "");
  if (t.includes("smarthome")) return "smarthome";
  if (t.includes("savings")) return "savings";
  if (t.includes("meal")) return "meal";
  if (t.includes("expense")) return "expense";
  if (t.includes("income")) return "income";
  return "unknown";
}

/** 節約アクションの説明文が、既存の節約アクション一覧のどれかと同じ行動の繰り返しかどうかを判定する。
 * 一致すればそのidを、新しい種類の行動なら null を返す。既存の習慣を毎回別カード・別金額として
 * 登録してしまわないように、LINEからの登録時に使う（既存カードへの複製登録に振り分けるため）。 */
export async function matchSavingsAction(
  text: string,
  existing: { id: string; title: string; keywords: string[] }[]
): Promise<string | null> {
  if (existing.length === 0) return null;
  const listing = existing.map((e) => `${e.id}: ${e.title}（${e.keywords.join("、")}）`).join("\n");
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `次のメッセージが、下の「既存の節約アクション一覧」のどれかと同じ種類の行動の繰り返しだと判断できる場合は、そのidだけを返してください。厳密に同一である必要はなく、同じ習慣・同じ工夫の繰り返しとみなせれば一致とみなしてください。どれとも一致しない新しい種類の行動であれば、"none"とだけ返してください。id、または"none"以外の文字は一切含めないでください。

既存の節約アクション一覧:
${listing}

メッセージ: ${text}`,
      },
    ],
  });
  const raw = joinText(res.content).trim();
  const match = existing.find((e) => raw.includes(e.id));
  return match ? match.id : null;
}

/** 商品名・行動の内容を一目で表す絵文字を1つだけ選ぶ（割引購入カードなど、金額計算をAIに頼らない
 * 節約アクション登録経路で使う軽量な補助呼び出し）。 */
export async function pickEmoji(text: string): Promise<string> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 20,
    messages: [
      {
        role: "user",
        content: `次の商品・行動の内容を一目で表す絵文字を1つだけ返してください。絵文字以外の文字は一切含めないでください。\n内容: ${text}`,
      },
    ],
  });
  const raw = joinText(res.content).trim();
  return raw.slice(0, 8) || "🏷️";
}

export interface SmartHomeCommandResult {
  type: "device" | "scene" | "unknown";
  id: string | null;
  command: string | null;
}

/** 家電操作の自然文 → 対象デバイス/シーンとコマンド。実在するデバイス・シーン一覧を渡して、その中から選ばせる（幻覚防止）。 */
export async function interpretSmartHomeCommand(
  text: string,
  devices: { id: string; name: string; type: string }[],
  scenes: { id: string; name: string }[]
): Promise<SmartHomeCommandResult> {
  const deviceList = devices.map((d) => `${d.id}=${d.name}(${d.type})`).join(", ") || "なし";
  const sceneList = scenes.map((s) => `${s.id}=${s.name}`).join(", ") || "なし";
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `次のメッセージが、下のデバイス一覧のどれかを操作したいのか、シーン一覧のどれかを実行したいのかを判定してください。
デバイス一覧（id=名前(種類)）: ${deviceList}
シーン一覧（id=名前）: ${sceneList}
デバイスの場合、コマンドは種類に応じて turnOn / turnOff / press / lock / unlock / open / close / pause のいずれかを選んでください（例: Curtainならopen/close、Lockならlock/unlock、それ以外は基本turnOn/turnOff）。
一覧の中に明確に一致するものが無ければtype:"unknown"にしてください。次のJSONのみを返してください。前置きやコードブロックは不要です。
{"type":"device"|"scene"|"unknown","id":"該当するid（無ければnull）","command":"デバイスの場合のコマンド（シーン・unknownならnull）"}
メッセージ: ${text}`,
      },
    ],
  });
  const t = stripFence(joinText(res.content));
  return JSON.parse(t) as SmartHomeCommandResult;
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

export interface SavingsEstimate {
  title: string;
  estimated_saving: number;
  reasoning: string;
  keywords: string[];
  emoji: string;
}

/** 工夫して支出を抑えた行動の説明文から、その経済効果（節約額の推定）をAIで見積もる。
 * 一般的な市場価格・相場をもとにした概算でよく、厳密な計算は求めない（多少の誤差は許容）。 */
export async function estimateSavingsAction(description: string, todayStr: string): Promise<SavingsEstimate> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `次は、工夫して支出を抑えた・節約した行動の説明です。今日の日付: ${todayStr}
一般的な市場価格や相場をもとに、この行動によって節約できたと考えられる金額（円）を現実的に見積もってください。厳密な計算は不要ですが、根拠のある妥当な金額にしてください（例えば「自家製ヨーグルトを1.1kg作った」なら、同量の市販ヨーグルトの実勢価格を基準に考える。「ポイントで支払った」なら、使ったポイント分の金額をそのまま節約額とする）。何も節約になっていない・金額を見積もれない内容であれば0にしてください。
説明文に実際に支払った金額（例:「支払620円」「まとめ買いで3200円」など）が含まれている場合は、その金額を実際の支払額として扱い、通常（バラ買い・定価）で購入した場合の想定金額との差額を節約額としてください。相場の推測に頼らず、書かれている支払額を優先してください。

次のJSONのみを返してください。前置きやコードブロックは不要です。
{"title":"行動を表す短いタイトル（15文字程度、例: 自家製ヨーグルトで節約）","estimated_saving":節約額の数値（円、0以上の整数）,"reasoning":"金額の根拠を1〜2文の日本語で（例: 市販の同量のヨーグルトは通常500円前後のため）","keywords":["検索用の日本語キーワードを3〜6個程度。行動の種類・使った物・カテゴリなど"],"emoji":"行動の内容を一目で表す絵文字を1つだけ（例: コーヒーの自炊なら☕、食品なら🥗、ポイント利用なら🎟️など）"}

行動の説明: ${description}`,
      },
    ],
  });
  const t = stripFence(joinText(res.content));
  const parsed = JSON.parse(t) as Partial<SavingsEstimate>;
  return {
    title: (String(parsed.title ?? "").trim() || "節約アクション").slice(0, 60),
    estimated_saving: Math.max(0, Math.round(Number(parsed.estimated_saving) || 0)),
    reasoning: String(parsed.reasoning ?? "").trim(),
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 8)
      : [],
    emoji: String(parsed.emoji ?? "").trim().slice(0, 8) || "💡",
  };
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

/** LINEに1日数回送る生活tips用。useWebSearchがtrueならweb検索を使う（前日ニュースダイジェスト用）。
 * maxTokensは呼び出し側（lib/lineDailyTips.ts）がコーナーごとの分量に応じて指定する
 * （短すぎると、引用や具体例を含む長めのコーナーで</output>閉じタグの手前で応答が切れてしまうため）。
 * 呼び出し側が<output>タグで本文を抽出する前提の、タグ込みの生テキストを返す。 */
export async function generateDailyTip(prompt: string, useWebSearch: boolean, maxTokens: number): Promise<string> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
    ...(useWebSearch ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" }] } : {}),
  });
  return joinText(res.content).trim() || "本日分の生成に失敗しました。";
}

export interface YearHighlight {
  date: string;
  title: string;
  description: string;
  importance: "major" | "normal";
}

/** 年間タイムライン機能: 1年分の日記（本人の分のみ）＋その日の支出メモから、タイムラインに載せる
 * 出来事を抜き出す。人生の節目だけでなく、祭り・花火大会・けんかなど思い出に残る日も対象にする。
 * 抽出結果は本人にしか表示されないが、年末の振り返り等でパートナーと一緒に見る場面もあり得るため、
 * 極端にプライベートな内容は選ばないようプロンプトで指示している。 */
export async function extractYearHighlightsFromJournal(
  year: number,
  entries: { date: string; body: string; expenseNote?: string }[]
): Promise<YearHighlight[]> {
  const capped = entries.slice(0, 200);
  const body = capped
    .map((e) => `${e.date}: ${e.body.slice(0, 300)}${e.expenseNote ? `（その日の支出: ${e.expenseNote}）` : ""}`)
    .join("\n\n");
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `あなたは日記から、その年のタイムラインに載せる出来事を抜き出す編集者です。以下は${year}年の日記です（日付: 本文。その日に支出の記録があれば参考として添えています）。

次のような、後から振り返って「あの年はこんなことがあった」と思えることを選んでください。
・結婚・出産・引っ越しなど人生の大きな節目
・旅行、お祭り、花火大会など思い出に残る外出やイベント
・大きな決断、けんかや仲直りなど感情的に大きな出来事
普段通りの食事や体調管理の記録など、特に印象に残らない日常の記述は含めないでください。多くても10件程度。

これはあなた自身の日記ですが、抽出結果は年末の振り返りなどでパートナーと一緒に見る場面もあり得ます。客観的に考えてパートナーに見せるべきでないと判断できる、踏み込みすぎた内容は選ばないでください。けんかのような出来事でも、事実を簡潔に・穏当な言い方で構いません。

それぞれに重要度を付けてください。"major"=結婚・出産・プロポーズ・大きな旅行など特に大きな節目、"normal"=お祭り・花火大会など思い出深いが節目ではないもの。

JSON配列のみを返してください。前置きやコードブロックは不要です。
形式: [{"date":"YYYY-MM-DD","title":"短い見出し(10字程度)","description":"1〜2文の説明","importance":"major"または"normal"}]

${body}`,
      },
    ],
  });
  const t = stripFence(joinText(res.content));
  const arr = JSON.parse(t);
  return Array.isArray(arr) ? arr : [arr];
}

/** 年間タイムライン機能: 同じカテゴリ・近い日付でまとめた支出の塊（例: 北海道旅行の一式）に、
 * 内容から推測できる短い見出しを1つずつ付ける。クラスタ数に関わらず1回のAI呼び出しで済ませる。 */
export async function titleExpenseClusters(clusters: { category: string; from: string; to: string; memos: string[] }[]): Promise<string[]> {
  if (clusters.length === 0) return [];
  const listing = clusters.map((c, i) => `${i + 1}. カテゴリ:${c.category} 期間:${c.from}〜${c.to} 内容:${c.memos.join("、")}`).join("\n");
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `次は家計簿の支出をカテゴリと日付の近さでまとめたグループの一覧です。それぞれの内容から、旅行なら行き先、それ以外は何のためのお金かが一目でわかる短い見出し（5〜10字程度、例:「北海道旅行」「結婚式費用」）を1つずつ考えてください。JSON配列のみを返してください（要素数・順番は入力と同じにすること）。前置きやコードブロックは不要です。
形式: ["見出し1","見出し2",...]

${listing}`,
      },
    ],
  });
  const clusterTitlesRaw = stripFence(joinText(res.content));
  const clusterTitlesArr = JSON.parse(clusterTitlesRaw);
  return Array.isArray(clusterTitlesArr) ? clusterTitlesArr.map((s) => String(s)) : [];
}
