import "server-only";
import { db } from "./db";
import { computeDiscountSaving } from "./discountMath";
import { pickEmoji } from "./anthropic";

export interface SavingsActionRow {
  id: string;
  owner: string;
  date: string;
  description: string;
  title: string;
  estimated_saving: number;
  reasoning: string;
  keywords: string[];
  emoji: string;
  created_at: string;
}

export interface SavingsActionLogRow {
  id: string;
  action_id: string;
  owner: string;
  date: string;
  estimated_saving: number;
  created_at: string;
}

/** カード一覧に付与する集計情報。同じ習慣を繰り返した回数と、累積の節約額。 */
export interface SavingsActionWithStats extends SavingsActionRow {
  occurrence_count: number;
  last_date: string;
}

/** 節約履歴（カレンダー・日ごとの一覧用）の1件。カード自身の初回分＋各履歴ログを合わせたもの。 */
export interface SavingsHistoryEntry {
  id: string;
  action_id: string;
  owner: string;
  date: string;
  title: string;
  emoji: string;
  estimated_saving: number;
}

const LIST_LIMIT = 500;
const LOG_LIMIT = 5000;

async function fetchCardsAndLogs(): Promise<{ cards: SavingsActionRow[]; logs: SavingsActionLogRow[] }> {
  const [cardsRes, logsRes] = await Promise.all([
    db()
      .from("savings_actions")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    db().from("savings_action_logs").select("*").limit(LOG_LIMIT),
  ]);
  if (cardsRes.error) throw cardsRes.error;
  if (logsRes.error) throw logsRes.error;
  return { cards: (cardsRes.data ?? []) as SavingsActionRow[], logs: (logsRes.data ?? []) as SavingsActionLogRow[] };
}

/** 世帯で共有する節約アクションのカード一覧（誰が記録したかに関わらず全件）。新しい順。
 * 同じ習慣を繰り返し記録してもカードは増えず、代わりに estimated_saving が履歴分の累積額に、
 * occurrence_count が実施回数になる。 */
export async function listSavingsActions(): Promise<SavingsActionWithStats[]> {
  const { cards, logs } = await fetchCardsAndLogs();
  const logsByAction = new Map<string, SavingsActionLogRow[]>();
  for (const log of logs) {
    const arr = logsByAction.get(log.action_id) ?? [];
    arr.push(log);
    logsByAction.set(log.action_id, arr);
  }
  return cards.map((c) => {
    const cardLogs = logsByAction.get(c.id) ?? [];
    const total = c.estimated_saving + cardLogs.reduce((s, l) => s + l.estimated_saving, 0);
    const lastDate = cardLogs.reduce((max, l) => (l.date > max ? l.date : max), c.date);
    return { ...c, estimated_saving: total, occurrence_count: 1 + cardLogs.length, last_date: lastDate };
  });
}

/** カレンダー・日ごとの節約履歴表示用に、カード自身の初回分＋全履歴ログを1本の一覧に平坦化する。新しい順。 */
export async function listSavingsHistory(): Promise<SavingsHistoryEntry[]> {
  const { cards, logs } = await fetchCardsAndLogs();
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const fromCards: SavingsHistoryEntry[] = cards.map((c) => ({
    id: c.id,
    action_id: c.id,
    owner: c.owner,
    date: c.date,
    title: c.title,
    emoji: c.emoji,
    estimated_saving: c.estimated_saving,
  }));
  const fromLogs: SavingsHistoryEntry[] = [];
  for (const l of logs) {
    const card = cardById.get(l.action_id);
    if (!card) continue;
    fromLogs.push({
      id: l.id,
      action_id: l.action_id,
      owner: l.owner,
      date: l.date,
      title: card.title,
      emoji: card.emoji,
      estimated_saving: l.estimated_saving,
    });
  }
  return [...fromCards, ...fromLogs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function getSavingsActionById(id: string): Promise<SavingsActionRow | null> {
  const { data, error } = await db().from("savings_actions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as SavingsActionRow | null;
}

/** 新しい種類の節約アクションとしてカードを1枚作る。既存カードと同じ習慣の繰り返しの場合は、
 * これではなく logSavingsActionOccurrence() を使ってカードを増やさず履歴だけ増やすこと。 */
export async function createSavingsAction(input: {
  owner: string;
  date: string;
  description: string;
  title: string;
  estimated_saving: number;
  reasoning: string;
  keywords: string[];
  emoji: string;
}): Promise<SavingsActionRow> {
  const { data, error } = await db().from("savings_actions").insert(input).select("*").single();
  if (error) throw error;
  return data as SavingsActionRow;
}

/** 既存カードと同じ習慣を今日もまた行った場合の記録。新しいカードは作らず、
 * そのカードの履歴（savings_action_logs）に1件だけ積む。節約額はカード作成時の金額をそのまま使う。 */
export async function logSavingsActionOccurrence(input: {
  action_id: string;
  owner: string;
  date: string;
}): Promise<{ log: SavingsActionLogRow; card: SavingsActionRow }> {
  const card = await getSavingsActionById(input.action_id);
  if (!card) throw new Error("元のカードが見つかりません");
  const { data, error } = await db()
    .from("savings_action_logs")
    .insert({ action_id: input.action_id, owner: input.owner, date: input.date, estimated_saving: card.estimated_saving })
    .select("*")
    .single();
  if (error) throw error;
  return { log: data as SavingsActionLogRow, card };
}

/** 「○○を○%オフで○○円で買った」という割引購入の節約アクションを登録する。節約額はAIに推測させず、
 * サーバー側で支払額と割引率から確定計算する（絵文字の選定だけAIに任せる）。購入ごとに金額が変わるため、
 * 常に新規カードとして扱う（既存カードとの照合はしない）。 */
export async function createDiscountSavingsAction(
  owner: string,
  input: { item: string; discountPercent: number; pricePaid: number; date: string }
): Promise<SavingsActionRow> {
  const { originalPrice, saving } = computeDiscountSaving(input.pricePaid, input.discountPercent);
  const emoji = await pickEmoji(input.item).catch(() => "🏷️");
  return createSavingsAction({
    owner,
    date: input.date,
    description: `${input.item}を${input.discountPercent}%オフの${input.pricePaid.toLocaleString()}円で購入した`,
    title: `${input.item}を${input.discountPercent}%オフで購入`,
    estimated_saving: saving,
    reasoning: `定価${originalPrice.toLocaleString()}円のところ${input.discountPercent}%オフの${input.pricePaid.toLocaleString()}円で購入。差額${saving.toLocaleString()}円が節約分。`,
    keywords: [input.item, "割引", `${input.discountPercent}%オフ`],
    emoji,
  });
}

/** カードを削除する（紐づく履歴ログもcascadeで一緒に削除される）。 */
export async function deleteSavingsAction(id: string): Promise<boolean> {
  const { data, error } = await db().from("savings_actions").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
