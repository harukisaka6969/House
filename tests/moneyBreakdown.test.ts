import { describe, it, expect } from "vitest";
import { breakdownYen, assertBreakdownSum, DENOMINATIONS } from "@/lib/moneyBreakdown";

function sumOf(total: number): number {
  return breakdownYen(total).reduce((s, d) => s + d.value * d.count, 0);
}

describe("breakdownYen", () => {
  it("matches the spec's worked example: 3480 -> 1000x3, 100x4, 50x1, 10x3", () => {
    const b = breakdownYen(3480);
    expect(b).toEqual([
      { value: 1000, count: 3, kind: "bill" },
      { value: 100, count: 4, kind: "coin" },
      { value: 50, count: 1, kind: "coin" },
      { value: 10, count: 3, kind: "coin" },
    ]);
  });

  it("returns an empty array for zero", () => {
    expect(breakdownYen(0)).toEqual([]);
  });

  it("clamps negative totals to zero instead of breaking", () => {
    expect(breakdownYen(-500)).toEqual([]);
  });

  it("handles a single 1-yen remainder", () => {
    const b = breakdownYen(1);
    expect(b).toEqual([{ value: 1, count: 1, kind: "coin" }]);
  });

  it("handles large 6-digit amounts without breaking, sum always matches", () => {
    for (const total of [100000, 345680, 999999]) {
      expect(sumOf(total)).toBe(total);
    }
  });

  it("rounds fractional yen to the nearest integer before breaking down", () => {
    expect(sumOf(1234.6)).toBe(1235);
  });

  it("always reconstructs the exact total for a wide sweep of amounts", () => {
    for (let total = 0; total <= 20000; total += 137) {
      expect(sumOf(total)).toBe(total);
    }
  });

  it("never produces a zero-count entry", () => {
    const b = breakdownYen(10000);
    expect(b.every((d) => d.count > 0)).toBe(true);
    expect(b).toEqual([{ value: 10000, count: 1, kind: "bill" }]);
  });

  it("classifies denominations >= 1000 as bills and the rest as coins", () => {
    const b = breakdownYen(11111);
    for (const d of b) {
      expect(d.kind).toBe(d.value >= 1000 ? "bill" : "coin");
    }
  });
});

describe("assertBreakdownSum", () => {
  it("does not throw when the breakdown matches the total", () => {
    expect(() => assertBreakdownSum(breakdownYen(3480), 3480)).not.toThrow();
  });

  it("throws when the breakdown does not match the total", () => {
    expect(() => assertBreakdownSum(breakdownYen(3480), 9999)).toThrow();
  });
});

describe("DENOMINATIONS", () => {
  it("is sorted descending so the greedy algorithm is correct", () => {
    const sorted = [...DENOMINATIONS].sort((a, b) => b - a);
    expect([...DENOMINATIONS]).toEqual(sorted);
  });
});
