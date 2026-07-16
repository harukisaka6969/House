import "server-only";
import { db } from "./db";
import type { Account } from "./types";

export async function getAccounts(): Promise<Account[]> {
  const { data, error } = await db().from("accounts").select("*").order("sort", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Account[];
}

export async function updateAccounts(
  updates: { id: string; name?: string; budget?: number }[]
): Promise<Account[]> {
  for (const u of updates) {
    const patch: Record<string, unknown> = {};
    if (u.name !== undefined) patch.name = u.name;
    if (u.budget !== undefined) patch.budget = Math.round(Number(u.budget)) || 0;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await db().from("accounts").update(patch).eq("id", u.id);
    if (error) throw error;
  }
  return getAccounts();
}
