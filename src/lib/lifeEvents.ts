import "server-only";
import { db } from "./db";
import type { LifeEventRow } from "./types";

export { toFamilyLifeEvents } from "./v2Privacy";

/** 世帯共有・プライバシー区分なし（spec v2 §3.1）。 */
export async function getLifeEvents(): Promise<LifeEventRow[]> {
  const { data, error } = await db().from("life_events").select("*").order("event_year", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LifeEventRow[];
}

export interface NewLifeEventInput {
  name: string;
  event_year: number;
  event_month?: number | null;
  cost_low: number;
  cost_high: number;
  cost_basis?: string | null;
  monthly_saving?: number;
  linked?: boolean;
  memo?: string | null;
  visible_to_family?: boolean;
}

export async function createLifeEvent(input: NewLifeEventInput): Promise<LifeEventRow> {
  const { data, error } = await db()
    .from("life_events")
    .insert({
      name: input.name.trim(),
      event_year: input.event_year,
      event_month: input.event_month ?? null,
      cost_low: Math.round(Number(input.cost_low)) || 0,
      cost_high: Math.round(Number(input.cost_high)) || 0,
      cost_basis: input.cost_basis?.trim() ?? "",
      monthly_saving: Math.round(Number(input.monthly_saving)) || 0,
      linked: input.linked ?? true,
      memo: input.memo?.trim() ?? "",
      visible_to_family: input.visible_to_family ?? true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as LifeEventRow;
}

export interface UpdateLifeEventInput extends Partial<NewLifeEventInput> {
  status?: "active" | "done" | "cancelled";
  funded?: number;
}

export async function updateLifeEvent(id: string, input: UpdateLifeEventInput): Promise<LifeEventRow | null> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.event_year !== undefined) patch.event_year = input.event_year;
  if (input.event_month !== undefined) patch.event_month = input.event_month;
  if (input.cost_low !== undefined) patch.cost_low = Math.round(Number(input.cost_low)) || 0;
  if (input.cost_high !== undefined) patch.cost_high = Math.round(Number(input.cost_high)) || 0;
  if (input.cost_basis !== undefined) patch.cost_basis = input.cost_basis?.trim() ?? "";
  if (input.monthly_saving !== undefined) patch.monthly_saving = Math.round(Number(input.monthly_saving)) || 0;
  if (input.linked !== undefined) patch.linked = input.linked;
  if (input.memo !== undefined) patch.memo = input.memo?.trim() ?? "";
  if (input.visible_to_family !== undefined) patch.visible_to_family = input.visible_to_family;
  if (input.status !== undefined) patch.status = input.status;
  if (input.funded !== undefined) patch.funded = Math.round(Number(input.funded)) || 0;
  const { data, error } = await db().from("life_events").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as LifeEventRow | null;
}

export async function deleteLifeEvent(id: string): Promise<boolean> {
  const { data, error } = await db().from("life_events").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** fundedを加算する（spec §3.3: 支出連携は任意実装のため見送り。手動記録のみ）。 */
export async function contributeLifeEvent(id: string, amount: number): Promise<number> {
  const { data, error } = await db().rpc("contribute_life_event", { p_event_id: id, p_amount: Math.round(Number(amount)) || 0 });
  if (error) throw error;
  return data as number;
}
