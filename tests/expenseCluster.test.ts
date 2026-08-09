import { describe, it, expect } from "vitest";
import { clusterExpenses, fallbackClusterTitle } from "@/lib/expenseCluster";

describe("clusterExpenses", () => {
  it("groups a Hokkaido-trip-like run of same-category expenses within the gap window", () => {
    const rows = [
      { id: "1", date: "2026-07-26", category: "旅行", memo: "北海道 ジンギスカン", amount: 8635 },
      { id: "2", date: "2026-07-26", category: "旅行", memo: "北海道 ウィンザーホテル", amount: 84000 },
      { id: "3", date: "2026-07-27", category: "旅行", memo: "北海道 ガソリン代", amount: 7263 },
      { id: "4", date: "2026-07-28", category: "旅行", memo: "羽田空港駐車場", amount: 14300 },
      { id: "5", date: "2026-07-28", category: "旅行", memo: "北海道レンタカー", amount: 41800 },
    ];
    const clusters = clusterExpenses(rows);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(5);
  });

  it("keeps different categories separate even on the same day", () => {
    const rows = [
      { id: "1", date: "2026-03-01", category: "交際費", memo: "結婚式費用", amount: 1000000 },
      { id: "2", date: "2026-03-01", category: "その他", memo: "月次支出", amount: 593411 },
    ];
    const clusters = clusterExpenses(rows);
    expect(clusters).toHaveLength(2);
  });

  it("splits into separate clusters once the gap exceeds the threshold", () => {
    const rows = [
      { id: "1", date: "2026-03-01", category: "交際費", memo: "結婚式費用（自己負担分）", amount: 1000000 },
      { id: "2", date: "2026-03-15", category: "交際費", memo: "結婚式費用（残額）", amount: 1440000 },
    ];
    const clusters = clusterExpenses(rows);
    expect(clusters).toHaveLength(2);
  });

  it("returns single-item clusters for isolated expenses", () => {
    const rows = [{ id: "1", date: "2026-07-26", category: "交際費", memo: "ご祝儀", amount: 50000 }];
    const clusters = clusterExpenses(rows);
    expect(clusters).toEqual([rows]);
  });

  it("does not let an interleaved different-category expense break a same-category chain", () => {
    const rows = [
      { id: "1", date: "2026-07-24", category: "旅行", memo: "北海道 ジンギスカン", amount: 8635 },
      { id: "2", date: "2026-07-26", category: "交際費", memo: "楊の結婚式ご祝儀", amount: 50000 },
      { id: "3", date: "2026-07-26", category: "旅行", memo: "北海道 ウィンザーホテル", amount: 84000 },
      { id: "4", date: "2026-07-27", category: "旅行", memo: "北海道 ガソリン代", amount: 7263 },
    ];
    const clusters = clusterExpenses(rows);
    const travel = clusters.find((c) => c[0].category === "旅行");
    expect(travel).toHaveLength(3);
    const gift = clusters.find((c) => c[0].category === "交際費");
    expect(gift).toHaveLength(1);
  });

  it("chains gaps: a-b within gap, b-c within gap, but a-c beyond gap still merges via the chain", () => {
    const rows = [
      { id: "1", date: "2026-01-01", category: "旅行", memo: "day1", amount: 1000 },
      { id: "2", date: "2026-01-05", category: "旅行", memo: "day5", amount: 1000 },
      { id: "3", date: "2026-01-09", category: "旅行", memo: "day9", amount: 1000 },
    ];
    // gap(1->5)=4<=5, gap(5->9)=4<=5, so all three chain into one cluster even though day1->day9 is 8 days apart.
    const clusters = clusterExpenses(rows);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });
});

describe("fallbackClusterTitle", () => {
  it("uses the memo for a single-item cluster", () => {
    const cluster = [{ id: "1", date: "2026-07-26", category: "交際費", memo: "ご祝儀", amount: 50000 }];
    expect(fallbackClusterTitle(cluster)).toBe("ご祝儀");
  });

  it("falls back to category and empty memo", () => {
    const cluster = [{ id: "1", date: "2026-07-26", category: "旅行", memo: "", amount: 50000 }];
    expect(fallbackClusterTitle(cluster)).toBe("旅行");
  });

  it("uses category + date range for a multi-item cluster", () => {
    const cluster = [
      { id: "1", date: "2026-07-26", category: "旅行", memo: "a", amount: 1000 },
      { id: "2", date: "2026-07-28", category: "旅行", memo: "b", amount: 1000 },
    ];
    expect(fallbackClusterTitle(cluster)).toBe("旅行（7/26〜7/28）");
  });

  it("uses a single date when the cluster spans one day", () => {
    const cluster = [
      { id: "1", date: "2026-07-26", category: "旅行", memo: "a", amount: 1000 },
      { id: "2", date: "2026-07-26", category: "旅行", memo: "b", amount: 1000 },
    ];
    expect(fallbackClusterTitle(cluster)).toBe("旅行（7/26）");
  });
});
