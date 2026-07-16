import "server-only";
import { db } from "./db";
import { todayStrJST } from "./date";
import type { InvestmentRow } from "./types";

export interface NewInvestmentInput {
  date?: string | null;
  name: string;
  amount: number;
  memo?: string | null;
}

export async function addInvestment(ownerId: string, input: NewInvestmentInput): Promise<InvestmentRow> {
  const name = input.name?.trim();
  const amount = Math.round(Number(input.amount));
  if (!name) throw new Error("投資先が未入力です");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("金額が不正です");
  const date = input.date && input.date.trim() ? input.date.trim() : todayStrJST();
  const { data, error } = await db()
    .from("investments")
    .insert({ owner: ownerId, date, name, amount, memo: input.memo?.trim() ?? "" })
    .select("*")
    .single();
  if (error) throw error;
  return data as InvestmentRow;
}

export async function deleteInvestment(id: string, ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("investments").delete().eq("id", id).eq("owner", ownerId).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getInvestmentsInRange(fromDate: string, toDateExclusive: string): Promise<InvestmentRow[]> {
  const { data, error } = await db()
    .from("investments")
    .select("*")
    .gte("date", fromDate)
    .lt("date", toDateExclusive)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InvestmentRow[];
}

export async function getCumulativeInvestment(): Promise<number> {
  const { data, error } = await db().from("investments").select("amount");
  if (error) throw error;
  return (data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
}
