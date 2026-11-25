import "server-only";
import { db } from "./db";
import type { AdvanceRow } from "./advanceSettlement";

export interface AdvanceSettlementRow {
  cycle_key: string;
  settled_at: string;
  settled_by: string | null;
  amounts: Record<string, number>;
}

/** [from, to]（両端含む）の期間に入る立替（paid_byが付いた支出）。 */
export async function getAdvanceRowsInRange(from: string, to: string): Promise<AdvanceRow[]> {
  const { data, error } = await db()
    .from("expenses")
    .select("date, amount, paid_by, account_id, owner")
    .not("paid_by", "is", null)
    .gte("date", from)
    .lte("date", to);
  if (error) throw error;
  return (data ?? []) as AdvanceRow[];
}

export async function getAdvanceSettlements(cycleKeys: string[]): Promise<AdvanceSettlementRow[]> {
  if (cycleKeys.length === 0) return [];
  const { data, error } = await db().from("advance_settlements").select("*").in("cycle_key", cycleKeys);
  if (error) throw error;
  return (data ?? []) as AdvanceSettlementRow[];
}

/** 清算済みにする（金額のスナップショットを残す）。もう一度押しても最新の金額で上書きするだけ。 */
export async function markAdvanceSettled(cycleKey: string, settledBy: string, amounts: Record<string, number>): Promise<AdvanceSettlementRow> {
  const { data, error } = await db()
    .from("advance_settlements")
    .upsert({ cycle_key: cycleKey, settled_by: settledBy, amounts, settled_at: new Date().toISOString() }, { onConflict: "cycle_key" })
    .select("*")
    .single();
  if (error) throw error;
  return data as AdvanceSettlementRow;
}

/** 清算済みを取り消す（押し間違えたとき用）。 */
export async function unmarkAdvanceSettled(cycleKey: string): Promise<void> {
  const { error } = await db().from("advance_settlements").delete().eq("cycle_key", cycleKey);
  if (error) throw error;
}
