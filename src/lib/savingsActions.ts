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

const LIST_LIMIT = 500;

/** 世帯で共有する節約アクション一覧（誰が記録したかに関わらず全件）。新しい順。 */
export async function listSavingsActions(): Promise<SavingsActionRow[]> {
  const { data, error } = await db()
    .from("savings_actions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return (data ?? []) as SavingsActionRow[];
}

export async function getSavingsActionById(id: string): Promise<SavingsActionRow | null> {
  const { data, error } = await db().from("savings_actions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as SavingsActionRow | null;
}

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

/** 「○○を○%オフで○○円で買った」という割引購入の節約アクションを登録する。節約額はAIに推測させず、
 * サーバー側で支払額と割引率から確定計算する（絵文字の選定だけAIに任せる）。 */
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

export async function deleteSavingsAction(id: string): Promise<boolean> {
  const { data, error } = await db().from("savings_actions").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
