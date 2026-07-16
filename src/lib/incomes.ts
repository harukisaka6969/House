import "server-only";
import { db } from "./db";
import type { IncomeRow } from "./types";

export async function getIncomes(monthKey: string): Promise<IncomeRow[]> {
  const { data, error } = await db().from("incomes").select("*").eq("month", monthKey);
  if (error) throw error;
  return (data ?? []) as IncomeRow[];
}

export async function getIncomesInMonthRange(fromMonth: string, toMonth: string): Promise<IncomeRow[]> {
  const { data, error } = await db().from("incomes").select("*").gte("month", fromMonth).lte("month", toMonth);
  if (error) throw error;
  return (data ?? []) as IncomeRow[];
}

export interface IncomeInput {
  id?: string;
  name: string;
  amount: number;
  owner?: string | null;
}

/** Replaces all income rows for a month with the given set (両者編集可 — incomes have no per-viewer masking). */
export async function replaceIncomes(monthKey: string, incomes: IncomeInput[]): Promise<IncomeRow[]> {
  const { error: delErr } = await db().from("incomes").delete().eq("month", monthKey);
  if (delErr) throw delErr;
  if (incomes.length > 0) {
    const rows = incomes.map((i) => ({
      month: monthKey,
      name: i.name?.trim() ?? "",
      amount: Math.round(Number(i.amount)) || 0,
      owner: i.owner ?? null,
    }));
    const { error: insErr } = await db().from("incomes").insert(rows);
    if (insErr) throw insErr;
  }
  return getIncomes(monthKey);
}
