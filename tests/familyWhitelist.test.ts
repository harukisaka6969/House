import { describe, it, expect } from "vitest";
import { toFamilyLifeEvents, toFamilyMaintenance, toFamilyAssets } from "@/lib/v2Privacy";
import type { LifeEventRow, MaintenanceTaskRow, AssetRow } from "@/lib/types";

function event(overrides: Partial<LifeEventRow>): LifeEventRow {
  return {
    id: "id-" + Math.random(),
    name: "家の建て替え",
    event_year: 2031,
    event_month: null,
    cost_low: 18000000,
    cost_high: 22000000,
    cost_basis: "概算",
    funded: 3000000,
    monthly_saving: 80000,
    linked: true,
    memo: "",
    status: "active",
    visible_to_family: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function task(overrides: Partial<MaintenanceTaskRow>): MaintenanceTaskRow {
  return {
    id: "id-" + Math.random(),
    asset_id: "asset-1",
    name: "車検",
    interval_months: 24,
    est_cost: 100000,
    next_due: "2026-09-01",
    memo: "",
    active: true,
    visible_to_family: true,
    ...overrides,
  };
}

describe("v2 spec §5.4/§5.5 家族ロール向けライフイベント射影", () => {
  const active = event({ id: "e1", status: "active", visible_to_family: true, funded: 3000000, monthly_saving: 80000 });
  const cancelled = event({ id: "e2", status: "cancelled", visible_to_family: true });
  const hidden = event({ id: "e3", status: "active", visible_to_family: false });
  const all = [active, cancelled, hidden];

  it("includes only visible, non-cancelled events", () => {
    const out = toFamilyLifeEvents(all);
    expect(out.map((e) => e.id)).toEqual(["e1"]);
  });

  it("never exposes funded/monthly_saving/linked/status/visible_to_family keys", () => {
    const out = toFamilyLifeEvents(all);
    const serialized = JSON.stringify(out);
    for (const forbidden of ["funded", "monthly_saving", "linked", "status", "visible_to_family", "created_at"]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });
});

describe("v2 spec §5.4/§5.5 家族ロール向けメンテナンス射影", () => {
  const upcoming = task({ id: "t1", active: true, visible_to_family: true, est_cost: 100000 });
  const inactive = task({ id: "t2", active: false, visible_to_family: true });
  const hidden = task({ id: "t3", active: true, visible_to_family: false });
  const all = [upcoming, inactive, hidden];
  const assetNameOf = () => "Mark X";

  it("includes only active, visible tasks", () => {
    const out = toFamilyMaintenance(all, assetNameOf);
    expect(out.map((t) => t.id)).toEqual(["t1"]);
  });

  it("never exposes interval_months/memo/active/visible_to_family keys (no実施履歴・実費データ)", () => {
    const out = toFamilyMaintenance(all, assetNameOf);
    const serialized = JSON.stringify(out);
    for (const forbidden of ["interval_months", "memo", "active", "visible_to_family", "actual_cost"]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });
});

describe("v2 spec §5.4 家族ロール向け資産射影", () => {
  it("only exposes id/name/kind", () => {
    const rows: AssetRow[] = [{ id: "a1", name: "Mark X GRX130", kind: "car", acquired_date: "2020-01-01", memo: "秘密のメモ" }];
    const out = toFamilyAssets(rows);
    expect(out).toEqual([{ id: "a1", name: "Mark X GRX130", kind: "car" }]);
    expect(JSON.stringify(out)).not.toContain("秘密のメモ");
  });
});

describe("v2 spec §5.5 家族ロールの禁止フィールドが全体としてどこにも現れない", () => {
  it("combined family payload never contains any of the spec's forbidden keys", () => {
    const events = toFamilyLifeEvents([event({ id: "e1" })]);
    const tasks = toFamilyMaintenance([task({ id: "t1" })], () => "Mark X");
    const combined = JSON.stringify({ events, tasks });
    const forbidden = ["saved", "monthly_plan", "funded", "monthly_saving", "actual_cost", "amount", "income", "budget"];
    for (const key of forbidden) {
      expect(combined).not.toContain(`"${key}"`);
    }
  });
});
