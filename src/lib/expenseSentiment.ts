import "server-only";
import { db } from "./db";

export type Sentiment = "good" | "bad";

export interface ExpenseSentimentRow {
  id: string;
  owner: string;
  date: string;
  total: number;
  sentiment: Sentiment;
  created_at: string;
}

/** 世帯（ハルキ＋アリサ）がその日に入力した支出の生データ（件数判定用にamountの配列で返す）。
 * 月合計等の既存の集計と同じ考え方で、a3の個別明細は非公開でも合計には両者分を含める。 */
export async function getHouseholdExpenseAmountsForDate(date: string): Promise<number[]> {
  const { data, error } = await db().from("expenses").select("amount").eq("date", date);
  if (error) throw error;
  return (data ?? []).map((r) => Number((r as { amount: number }).amount));
}

export async function getSentimentForDate(ownerId: string, date: string): Promise<ExpenseSentimentRow | null> {
  const { data, error } = await db().from("expense_sentiments").select("*").eq("owner", ownerId).eq("date", date).maybeSingle();
  if (error) throw error;
  return data as ExpenseSentimentRow | null;
}

/** 1日1件・再スワイプで上書き。合計金額はクライアントを信用せずサーバー側で毎回計算し直す。 */
export async function upsertSentiment(ownerId: string, date: string, total: number, sentiment: Sentiment): Promise<ExpenseSentimentRow> {
  const { data, error } = await db()
    .from("expense_sentiments")
    .upsert({ owner: ownerId, date, total, sentiment }, { onConflict: "owner,date" })
    .select("*")
    .single();
  if (error) throw error;
  return data as ExpenseSentimentRow;
}
