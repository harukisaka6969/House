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

/** 本人がその日に入力した支出の生データ（件数判定用にamountの配列で返す）。 */
export async function getOwnExpenseAmountsForDate(ownerId: string, date: string): Promise<number[]> {
  const { data, error } = await db().from("expenses").select("amount").eq("owner", ownerId).eq("date", date);
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
