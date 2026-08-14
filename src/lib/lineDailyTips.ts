import "server-only";
import { db } from "./db";
import { generateDailyTip } from "./anthropic";
import { prevDayStr } from "./date";

export type TipCategory =
  | "news"
  | "health"
  | "money"
  | "philosophy"
  | "wellbeing"
  | "chinese_philosophy"
  | "world_culture"
  | "fashion";

export interface TipDef {
  category: TipCategory;
  time: string; // "HH:MM" (JST)
  label: string;
  useWebSearch: boolean;
  /** 出典・具体例を含む長めのコーナーほど大きくする。小さすぎると</output>閉じタグの手前で
   * 応答が途切れ、生の<output>タグがそのままLINEに表示される事故につながる。 */
  maxTokens: number;
  /** 指定時は、そのslugのプロフィールだけに送る（世帯全員ではなく特定の1人向けのコーナー用）。
   * 省略時は従来通り家族全員（LINE連携済みowner全員）に送る。 */
  onlyForSlug?: string;
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

/** <output>本文を取り出す。万一トークン上限で応答が</output>閉じタグの手前で切れてしまった場合でも、
 * 生の<output>タグをそのままLINEに表示してしまわないよう、開始タグの直後から末尾までを使う。 */
function extractOutputContent(raw: string): string {
  const closed = extractTag(raw, "output");
  if (closed) return closed;
  const openIdx = raw.indexOf("<output>");
  if (openIdx !== -1) return raw.slice(openIdx + "<output>".length).trim();
  return raw.trim();
}

export const TIP_DEFS: TipDef[] = [
  {
    category: "news",
    time: "06:00",
    label: "📰 昨日のニュースダイジェスト",
    useWebSearch: true,
    maxTokens: 2000,
    buildPrompt: (recentFull, olderSummaries, today) => {
      const yesterday = prevDayStr(today);
      return `あなたは日本語のニュースダイジェストを書くライターです。web検索を使って、${yesterday}（${today}の前日）に日本国内外で報じられた重要なニュースの中から、家庭の生活に影響を与えるもの（物価・金利・税制・天候や災害・生活インフラなど）や、ビジネス・経済への影響が大きいものを中心に選び、2分程度で読める分量（800〜1000文字程度）の日本語のダイジェストとして自然な文章でまとめてください。箇条書きは使わず、読み物として自然につながる文章にしてください。

ダイジェスト本文の最後に、1行空けてから「🧠 今日の豆知識」という見出しを付けた段落を追加してください。この豆知識はニュースの内容とは無関係で構いません。科学、歴史、言語学、宇宙、生物、数学、美術、建築、地理、経済学、心理学など幅広い専門分野の中から、日によって異なる分野を選び、その分野について一般にはあまり知られていない、少し専門的だけれど分かりやすく説明すれば「へえ」と思えるような面白い豆知識を2〜3文で紹介してください。事実として正確なものだけを扱い、不確かな内容は含めないでください。

検索中である旨や「検索結果をもとに作成します」のような、作成プロセスに関する言葉は一切含めないでください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}
（豆知識についても、直近に取り上げた分野・話題と重複しないようにしてください。）`;
    },
  },
  {
    category: "chinese_philosophy",
    time: "09:00",
    label: "☯️ 東洋の智恵",
    useWebSearch: false,
    maxTokens: 1000,
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたは中国古典・東洋思想と現代心理学の両方に精通した専門家です。易経（易学）、儒教、道教、諸子百家など、古代中国の哲学思想の中から1つのテーマ・言葉・逸話を選び、それを現代の認知バイアス・行動心理学・対人関係の心理学など、心理学の知見と結びつけて、日本語で5〜6文程度、じっくりと掘り下げて伝えてください（例: 老子の「上善若水」と返報性・協調行動の心理、儒教の「己所不欲、勿施於人」と共感・視点取得の心理学、易経の変化の思想と現状維持バイアスなど）。古代の智恵が現代の心理学的な知見とどうつながるかが伝わるようにし、読んだ人が今日、少し立ち止まって考えたくなるような深さのある内容にしてください。原典の言葉や心理学の知見を引用する場合は、正確な出典・研究がはっきりしているものだけを扱ってください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
  {
    category: "health",
    time: "12:00",
    label: "💪 健康Tips",
    useWebSearch: false,
    maxTokens: 700,
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたはスポーツ科学・栄養学の専門家で、パワーリフティングやボディビルの競技者も指導しています。筋力・筋肥大・トレーニングパフォーマンスの向上に関わるトピック（トレーニング方法、栄養、休養・リカバリー、サプリメントなど）から1つを選び、今日から実践できる具体的なワンポイントアドバイスを日本語で3文程度にまとめてください。
必ず守ってほしい条件:
・査読付き研究やメタ分析など、しっかりした科学的根拠（化学的・生理学的なメカニズム）で効果が実証されているものだけを扱ってください。
・効果量が誤差レベルにとどまるような些細な内容は避け、パワーリフティングやボディビルの現場でも通用する、実践上はっきり意味のある効果が示されているものにしてください（例: プログレッシブオーバーロード、体重あたり十分なタンパク質摂取量、クレアチンの効果、トレーニングボリューム・頻度の最適化、十分な睡眠によるリカバリーなど）。
・科学的根拠が薄い俗説・都市伝説・個人の体験談レベルの話は扱わないでください。
${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
  {
    category: "money",
    time: "15:00",
    label: "💰 お金Tips",
    useWebSearch: false,
    maxTokens: 700,
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたはお金の専門家です。お金の使い方・投資・稼ぎ方・節約のいずれかについて、実践的なワンポイントアドバイスを日本語で3文程度にまとめてください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
  {
    category: "philosophy",
    time: "18:00",
    label: "🪶 今日の哲学",
    useWebSearch: false,
    maxTokens: 1000,
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたは哲学者です。人生において非常に重要な問い、または考えることで人生にプラスになる哲学的な視点を1つ選び、日本語で5〜6文程度、じっくりと掘り下げて伝えてください。読んだ人が今日、少し立ち止まって考えたくなるような深さのある内容にしてください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
  {
    category: "wellbeing",
    time: "21:00",
    label: "🌿 ウェルビーイングTips",
    useWebSearch: false,
    maxTokens: 700,
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたはメンタルヘルス・ウェルビーイングの専門家です。精神的な健康について、今日から実践できる具体的なワンポイントアドバイスを日本語で3文程度にまとめてください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
  {
    category: "world_culture",
    time: "23:00",
    label: "🌏 世界の異文化に学ぶ問い",
    useWebSearch: false,
    maxTokens: 1000,
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたは文化人類学・比較文化論の専門家です。世界のどこか（地域・民族・時代は問いません。日本や現代の主流な価値観以外であれば構いません）に見られる、時間の捉え方、死生観、個人と共同体の関係、成功や豊かさの定義、自然との向き合い方、家族やコミュニティのあり方などについての、独自のものの見方・考え方を1つ選んでください。その文化的背景を日本語で4〜5文程度で分かりやすく紹介したうえで、最後に改行してから、それを踏まえて読んだ人自身の価値観を振り返らせるような、一晩じっくり考えさせられる問いかけを1文だけ加えてください。事実として不正確な内容や、特定の文化への偏見・ステレオタイプ化は避け、敬意を持って扱ってください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
  {
    category: "fashion",
    time: "23:30",
    label: "👔 今日のファッション提案",
    useWebSearch: false,
    maxTokens: 500,
    onlyForSlug: "haruki",
    buildPrompt: (recentFull, olderSummaries) =>
      `あなたはメンズファッションスタイリストです。ユーザーは25歳男性で、体型は少し筋肉質でやや恰幅の良い（がっしりして少しふくよかな）体型です。この体型に似合う、今日から試せる服の色とシルエットの組み合わせを1つだけ提案してください。次の形式で、絵文字を使って見た目でパッと分かるようにまとめてください。

1行目: 色の組み合わせ（色を表す絵文字＋色名を2つ、例: 🟦ネイビー × ⬛チャコール）
2行目: 服の形（服を表す絵文字＋形の名前を2つ、例: 👕Vネック × 👖テーパード）
1行空けて3行目: 効果を一言だけ（15字以内、例: 首元すっきり、脚長見え）
1行空けて、続けて2〜3文程度で、なぜこの色・形の組み合わせがこの体型に似合うのかを分かりやすく説明してください（長くなりすぎないように）。

特定のブランド名・商品名は一切含めないでください。${COMMON_RULE}${avoidRepeatClause(recentFull, olderSummaries)}`,
  },
];

/** GitHub Actionsの実際の発火間隔は設定通り15分おきとは限らず、混雑時は1時間近く空くこともある。
 * 時刻の完全一致で判定すると、その1回のタイミングを逃した瞬間そのカテゴリは一日中送られなくなって
 * しまうため、「予定時刻を過ぎていて、今日まだ送っていない」ものは全て対象にする（自己修復・追いつき
 * 配信）。実際に送るかどうかは呼び出し側のhasTipSentTodayが最終判定する。 */
export function tipsDueForTime(currentHhmm: string): TipDef[] {
  return TIP_DEFS.filter((t) => t.time <= currentHhmm);
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
  const raw = await generateDailyTip(prompt, def.useWebSearch, def.maxTokens);
  const content = extractOutputContent(raw);
  const summary = extractTag(raw, "summary") || content.slice(0, 30);
  await recordTip(def.category, today, content, summary);
  return content;
}
