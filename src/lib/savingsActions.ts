import "server-only";
import { db } from "./db";
import { computeDiscountSaving, computeDiscountSavingFromOriginal } from "./discountMath";
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

/** カードに紐づく履歴（action_idあり）と、カード化しない単独記録（action_id無し、割引購入など
 * 毎回内容が変わり「次に同じものを選ぶ」意味が無いもの）の両方を表す。単独記録はtitle等を自前で持つ。 */
export interface SavingsActionLogRow {
  id: string;
  action_id: string | null;
  owner: string;
  date: string;
  estimated_saving: number;
  created_at: string;
  title: string | null;
  description: string | null;
  reasoning: string | null;
  keywords: string[];
  emoji: string | null;
}

/** カード一覧に付与する集計情報。同じ習慣を繰り返した回数と、累積の節約額。 */
export interface SavingsActionWithStats extends SavingsActionRow {
  occurrence_count: number;
  last_date: string;
}

/** 節約履歴（カレンダー・日ごとの一覧用）の1件。カード自身の初回分＋各履歴ログ＋単独記録を合わせたもの。 */
export interface SavingsHistoryEntry {
  id: string;
  action_id: string | null;
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
 * カードは「次に同じものを選びやすくする」ためのものなので、同じ習慣を繰り返し記録してもカードは増えず、
 * estimated_saving が履歴分の累積額に、occurrence_count が実施回数になる。割引購入などカード化しない
 * 単独記録（action_id無し）はここには含まれない。 */
export async function listSavingsActions(): Promise<SavingsActionWithStats[]> {
  const { cards, logs } = await fetchCardsAndLogs();
  const logsByAction = new Map<string, SavingsActionLogRow[]>();
  for (const log of logs) {
    if (!log.action_id) continue;
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

/** カレンダー・日ごとの節約履歴表示用に、カード自身の初回分＋カードの履歴ログ＋単独記録（割引購入など）を
 * 1本の一覧に平坦化する。新しい順。 */
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
    if (l.action_id) {
      const card = cardById.get(l.action_id);
      if (!card) continue;
      fromLogs.push({ id: l.id, action_id: l.action_id, owner: l.owner, date: l.date, title: card.title, emoji: card.emoji, estimated_saving: l.estimated_saving });
    } else if (l.title && l.emoji) {
      fromLogs.push({ id: l.id, action_id: null, owner: l.owner, date: l.date, title: l.title, emoji: l.emoji, estimated_saving: l.estimated_saving });
    }
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

/** 「○○を○%オフ（または元の金額○○円のところ）○○円で買った」という割引購入・ポイント等での無料入手の
 * 節約アクションを登録する。節約額はAIに推測させず、サーバー側で確定計算する（絵文字の選定だけAIに任せる）。
 * 購入ごとに商品も金額も変わり「次に同じものを選ぶ」意味を持たないため、カードは作らず節約履歴に単独記録として残す。
 * discountPercentを渡せば割引率から、originalPriceを渡せば元の金額から直接、節約額を計算する
 * （originalPrice指定時はpricePaidが0でもよく、ポイント等での全額相殺＝無料入手を表現できる）。 */
export async function createDiscountSavingsAction(
  owner: string,
  input: { item: string; pricePaid: number; date: string } & ({ discountPercent: number } | { originalPrice: number })
): Promise<SavingsActionLogRow> {
  const { originalPrice, saving } =
    "originalPrice" in input
      ? computeDiscountSavingFromOriginal(input.originalPrice, input.pricePaid)
      : computeDiscountSaving(input.pricePaid, input.discountPercent);
  const emoji = await pickEmoji(input.item).catch(() => "🏷️");
  const percent = originalPrice > 0 ? Math.min(100, Math.max(0, Math.round((saving / originalPrice) * 100))) : 0;
  const isFree = input.pricePaid <= 0 && saving > 0;
  const title = isFree ? `${input.item}を無料で入手` : `${input.item}を${percent}%オフで購入`;
  const description = isFree
    ? `${input.item}（定価${originalPrice.toLocaleString()}円相当）をポイント等で無料入手した`
    : `${input.item}を${percent}%オフの${input.pricePaid.toLocaleString()}円で購入した`;
  const reasoning = `定価${originalPrice.toLocaleString()}円のところ${input.pricePaid.toLocaleString()}円で購入。差額${saving.toLocaleString()}円が節約分。`;
  const keywords = isFree ? [input.item, "無料", "ポイント"] : [input.item, "割引", `${percent}%オフ`];
  const { data, error } = await db()
    .from("savings_action_logs")
    .insert({ action_id: null, owner, date: input.date, estimated_saving: saving, title, description, reasoning, keywords, emoji })
    .select("*")
    .single();
  if (error) throw error;
  return data as SavingsActionLogRow;
}

/** 「総合計のうち○○円をギフトカード（eGift等）で支払った」という、特定商品の値引きではなく支払い手段としての
 * ギフトカード充当分を節約として登録する。割引率や定価との比較ではなく、充当された金額そのものが節約額になる
 * （その分、財布からの実支出が減っているため）。購入ごとに内容が変わるため、カードは作らず節約履歴に単独記録として残す。 */
export async function createGiftCardSavingsAction(owner: string, input: { item: string; giftCardAmount: number; date: string }): Promise<SavingsActionLogRow> {
  const emoji = await pickEmoji(input.item).catch(() => "🎁");
  const title = `${input.item}をギフトカードで節約`;
  const description = `${input.item}の代金のうち${input.giftCardAmount.toLocaleString()}円をギフトカードで支払った`;
  const reasoning = `ギフトカードで${input.giftCardAmount.toLocaleString()}円分を充当したため、その分が実支出に対する節約分。`;
  const keywords = [input.item, "ギフトカード", "eGift"];
  const { data, error } = await db()
    .from("savings_action_logs")
    .insert({ action_id: null, owner, date: input.date, estimated_saving: input.giftCardAmount, title, description, reasoning, keywords, emoji })
    .select("*")
    .single();
  if (error) throw error;
  return data as SavingsActionLogRow;
}

/** カードを削除する（紐づく履歴ログもcascadeで一緒に削除される）。 */
export async function deleteSavingsAction(id: string): Promise<boolean> {
  const { data, error } = await db().from("savings_actions").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** 節約履歴の1件を、間違って登録してしまった場合などに削除する。
 * - カードに紐づく履歴ログ、または単独記録（割引購入等）なら、そのログ行をそのまま削除する。
 * - カード自身の初回分（＝entryId===actionIdで、カード行そのものが表す1件）を消す場合は、
 *   他に履歴ログが残っていれば最も古いログをカードの初回分に昇格させてそのログを削除し（カード自体は残す）、
 *   他に履歴が無ければカードごと削除する。 */
export async function deleteSavingsHistoryEntry(entryId: string, actionId: string | null): Promise<boolean> {
  if (actionId && entryId === actionId) {
    const { data: oldestLogs, error: logsErr } = await db()
      .from("savings_action_logs")
      .select("*")
      .eq("action_id", actionId)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);
    if (logsErr) throw logsErr;
    const promote = (oldestLogs ?? [])[0] as SavingsActionLogRow | undefined;
    if (promote) {
      const { error: updateErr } = await db()
        .from("savings_actions")
        .update({ date: promote.date, estimated_saving: promote.estimated_saving })
        .eq("id", actionId);
      if (updateErr) throw updateErr;
      const { data, error } = await db().from("savings_action_logs").delete().eq("id", promote.id).select("id");
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    }
    return deleteSavingsAction(actionId);
  }
  const { data, error } = await db().from("savings_action_logs").delete().eq("id", entryId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
