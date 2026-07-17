/**
 * Pure privacy/whitelist projections for v2 (wishlist is_private / family role §5.4).
 * Deliberately has NO "server-only" import (unlike wishlist.ts/lifeEvents.ts/maintenance.ts/assets.ts,
 * which are DB-access modules) so it can be imported from analysisExport.ts and from tests —
 * mirrors how aggregate.ts stays separate from expenses.ts for the same reason.
 */
import type { WishlistItemRow, LifeEventRow, MaintenanceTaskRow, AssetRow } from "./types";

/** is_private=trueの他人のアイテムは存在ごと除外する（v2 spec §2.5: 第3口座と違い合計すら共有しない）。 */
export function visibleWishlistItems(rows: WishlistItemRow[], viewerProfileId: string): WishlistItemRow[] {
  return rows.filter((r) => !r.is_private || r.owner === viewerProfileId);
}

/**
 * 家族ロール用ホワイトリスト射影（spec v2 §5.4）。返してよいフィールドのみを明示的に列挙する
 * ブラックリスト方式（除外方式）は将来フィールド追加時に漏洩するため使わない。
 * 対象: is_private=false かつ visible_to_family=true かつ status in (planning, saving) のみ。
 */
export function toFamilyWishlist(
  rows: WishlistItemRow[]
): { id: string; name: string; category: string | null; price: number; target_date: string | null; priority: number }[] {
  return rows
    .filter((r) => !r.is_private && r.visible_to_family && (r.status === "planning" || r.status === "saving"))
    .map((r) => ({ id: r.id, name: r.name, category: r.category, price: r.price, target_date: r.target_date, priority: r.priority }));
}

/** 家族ロール用ホワイトリスト射影（spec v2 §5.4）: funded/monthly_saving等の資金情報は一切含めない。 */
export function toFamilyLifeEvents(
  rows: LifeEventRow[]
): { id: string; name: string; event_year: number; event_month: number | null; cost_low: number; cost_high: number; memo: string }[] {
  return rows
    .filter((r) => r.visible_to_family && r.status !== "cancelled")
    .map((r) => ({ id: r.id, name: r.name, event_year: r.event_year, event_month: r.event_month, cost_low: r.cost_low, cost_high: r.cost_high, memo: r.memo }));
}

/** 家族ロール用ホワイトリスト射影（spec v2 §5.4）: 実施履歴・実費は一切含めない。今後の予定タスクのみ。 */
export function toFamilyMaintenance(
  tasks: MaintenanceTaskRow[],
  assetNameOf: (assetId: string) => string
): { id: string; asset_id: string; asset_name: string; name: string; est_cost: number; next_due: string }[] {
  return tasks
    .filter((t) => t.active && t.visible_to_family)
    .map((t) => ({ id: t.id, asset_id: t.asset_id, asset_name: assetNameOf(t.asset_id), name: t.name, est_cost: t.est_cost, next_due: t.next_due }));
}

/** 家族ロール用ホワイトリスト射影（spec v2 §5.4）: 資産名・種別のみ。 */
export function toFamilyAssets(rows: AssetRow[]): { id: string; name: string; kind: AssetRow["kind"] }[] {
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind }));
}
