import "server-only";
import { db } from "./db";
import { todayStrJST } from "./date";
import type { MaintenanceTaskRow, MaintenanceLogRow } from "./types";

export { toFamilyMaintenance } from "./v2Privacy";

export async function getMaintenanceTasks(): Promise<MaintenanceTaskRow[]> {
  const { data, error } = await db().from("maintenance_tasks").select("*").order("next_due", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MaintenanceTaskRow[];
}

export interface NewMaintenanceTaskInput {
  asset_id: string;
  name: string;
  interval_months?: number | null;
  est_cost?: number | null;
  next_due: string;
  memo?: string | null;
  visible_to_family?: boolean;
}

export async function createMaintenanceTask(input: NewMaintenanceTaskInput): Promise<MaintenanceTaskRow> {
  const { data, error } = await db()
    .from("maintenance_tasks")
    .insert({
      asset_id: input.asset_id,
      name: input.name.trim(),
      interval_months: input.interval_months ?? null,
      est_cost: Math.round(Number(input.est_cost)) || 0,
      next_due: input.next_due,
      memo: input.memo?.trim() ?? "",
      visible_to_family: input.visible_to_family ?? true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as MaintenanceTaskRow;
}

export async function updateMaintenanceTask(
  id: string,
  input: Partial<NewMaintenanceTaskInput> & { active?: boolean }
): Promise<MaintenanceTaskRow | null> {
  const patch: Record<string, unknown> = {};
  if (input.asset_id !== undefined) patch.asset_id = input.asset_id;
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.interval_months !== undefined) patch.interval_months = input.interval_months;
  if (input.est_cost !== undefined) patch.est_cost = Math.round(Number(input.est_cost)) || 0;
  if (input.next_due !== undefined) patch.next_due = input.next_due;
  if (input.memo !== undefined) patch.memo = input.memo?.trim() ?? "";
  if (input.visible_to_family !== undefined) patch.visible_to_family = input.visible_to_family;
  if (input.active !== undefined) patch.active = input.active;
  const { data, error } = await db().from("maintenance_tasks").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data as MaintenanceTaskRow | null;
}

export async function deleteMaintenanceTask(id: string): Promise<boolean> {
  const { data, error } = await db().from("maintenance_tasks").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Tasks due within `months` from today (12ヶ月ビュー / §6.1 サマリー連携の基礎データ)。 */
export async function getUpcomingTasks(months: number): Promise<MaintenanceTaskRow[]> {
  const today = todayStrJST();
  const [y, m, d] = today.split("-").map(Number);
  const until = new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
  const { data, error } = await db()
    .from("maintenance_tasks")
    .select("*")
    .eq("active", true)
    .lte("next_due", until)
    .order("next_due", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MaintenanceTaskRow[];
}

/** Tasks due within `days` from today (spec v2 §6.1: 今後30日の予定支出カード用)。 */
export async function getTasksDueWithinDays(days: number): Promise<MaintenanceTaskRow[]> {
  const today = todayStrJST();
  const [y, m, d] = today.split("-").map(Number);
  const until = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  const { data, error } = await db().from("maintenance_tasks").select("*").eq("active", true).lte("next_due", until).order("next_due", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MaintenanceTaskRow[];
}

export async function getLogsForTask(taskId: string): Promise<MaintenanceLogRow[]> {
  const { data, error } = await db()
    .from("maintenance_logs")
    .select("*")
    .eq("task_id", taskId)
    .order("done_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MaintenanceLogRow[];
}

/** 直近12ヶ月のログ（資産別の維持費実績集計用）。task_idごとのasset_idはlib/maintenance.getMaintenanceTasksとJOINして呼び出し側で解決する。 */
export async function getRecentLogs(sinceDate: string): Promise<MaintenanceLogRow[]> {
  const { data, error } = await db().from("maintenance_logs").select("*").gte("done_date", sinceDate);
  if (error) throw error;
  return (data ?? []) as MaintenanceLogRow[];
}

/** 直近ログ + 所属asset_id（資産別の年間維持費実績集計用）。 */
export async function getRecentLogsWithAsset(sinceDate: string): Promise<(MaintenanceLogRow & { asset_id: string })[]> {
  const { data, error } = await db()
    .from("maintenance_logs")
    .select("*, maintenance_tasks!inner(asset_id)")
    .gte("done_date", sinceDate);
  if (error) throw error;
  return ((data ?? []) as unknown as (MaintenanceLogRow & { maintenance_tasks: { asset_id: string } })[]).map((r) => {
    const { maintenance_tasks, ...rest } = r;
    return { ...rest, asset_id: maintenance_tasks.asset_id };
  });
}

export interface CompleteTaskInput {
  doneDate: string;
  actualCost: number;
  memo?: string | null;
  owner: string;
  createExpense: boolean;
  accountId?: string;
  category?: string;
}

/** ログ記録 + next_due繰り越し(単発ならactive=false) + 任意で支出登録、をDB関数で1トランザクションとして行う（spec §4.2-3）。 */
export async function completeMaintenanceTask(taskId: string, input: CompleteTaskInput): Promise<string> {
  const { data, error } = await db().rpc("complete_maintenance_task", {
    p_task_id: taskId,
    p_done_date: input.doneDate,
    p_actual_cost: Math.round(Number(input.actualCost)) || 0,
    p_memo: input.memo ?? "",
    p_owner: input.owner,
    p_create_expense: input.createExpense,
    p_account_id: input.accountId ?? null,
    p_category: input.category ?? null,
  });
  if (error) throw error;
  return data as string;
}
