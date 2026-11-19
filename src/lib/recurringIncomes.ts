import "server-only";
import { db } from "./db";

interface RecurringIncomeRow {
  id: string;
  owner: string | null;
  name: string;
  amount: number;
  last_generated_month: string | null;
}

/** 毎月の定期収入（給与など）を、その月（家計の月ラベル）の incomes に登録する。
 * 同じ月に登録済み、または同じ人・同じ名前の収入が既に手で登録されていればスキップする（冪等）。
 * 登録した件数を返す。 */
export async function generateRecurringIncomes(monthKey: string): Promise<number> {
  const { data, error } = await db().from("recurring_incomes").select("id, owner, name, amount, last_generated_month").eq("active", true);
  if (error) throw error;
  let created = 0;
  for (const r of (data ?? []) as RecurringIncomeRow[]) {
    if (r.last_generated_month === monthKey) continue;
    let existing = db().from("incomes").select("id").eq("month", monthKey).eq("name", r.name);
    existing = r.owner ? existing.eq("owner", r.owner) : existing.is("owner", null);
    const { data: found, error: selErr } = await existing.limit(1);
    if (selErr) throw selErr;
    if (!found || found.length === 0) {
      const { error: insErr } = await db().from("incomes").insert({ month: monthKey, name: r.name, amount: r.amount, owner: r.owner });
      if (insErr) throw insErr;
      created++;
    }
    const { error: updErr } = await db().from("recurring_incomes").update({ last_generated_month: monthKey }).eq("id", r.id);
    if (updErr) throw updErr;
  }
  return created;
}
