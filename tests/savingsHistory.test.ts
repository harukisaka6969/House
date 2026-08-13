import { describe, it, expect } from "vitest";
import { groupSavingsByDay, groupSavingsByWeek, weekStartOfDate, savingsPerDayMap, type SavingsHistoryItem } from "@/lib/savingsHistory";

function item(overrides: Partial<SavingsHistoryItem>): SavingsHistoryItem {
  return {
    id: "id-" + Math.random(),
    date: "2026-08-10",
    title: "テストアクション",
    emoji: "💡",
    estimated_saving: 100,
    ...overrides,
  };
}

describe("weekStartOfDate", () => {
  it("returns the same date for a Sunday", () => {
    // 2026-08-09 is a Sunday
    expect(weekStartOfDate("2026-08-09")).toBe("2026-08-09");
  });
  it("returns the preceding Sunday for a mid-week date", () => {
    // 2026-08-13 is a Thursday, week starts 2026-08-09
    expect(weekStartOfDate("2026-08-13")).toBe("2026-08-09");
  });
  it("returns the preceding Sunday for a Saturday", () => {
    expect(weekStartOfDate("2026-08-15")).toBe("2026-08-09");
  });
});

describe("groupSavingsByDay", () => {
  it("groups items by date and sums the daily total, newest date first", () => {
    const items = [
      item({ id: "a", date: "2026-08-10", estimated_saving: 150 }),
      item({ id: "b", date: "2026-08-10", estimated_saving: 50 }),
      item({ id: "c", date: "2026-08-12", estimated_saving: 300 }),
    ];
    const groups = groupSavingsByDay(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ date: "2026-08-12", total: 300 });
    expect(groups[1]).toMatchObject({ date: "2026-08-10", total: 200 });
    expect(groups[1].items.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("returns an empty array for no items", () => {
    expect(groupSavingsByDay([])).toEqual([]);
  });
});

describe("groupSavingsByWeek", () => {
  it("buckets items into Sunday-start weeks and sums per week, newest week first", () => {
    const items = [
      item({ date: "2026-08-09", estimated_saving: 100 }), // week of 8/9
      item({ date: "2026-08-13", estimated_saving: 200 }), // week of 8/9
      item({ date: "2026-08-16", estimated_saving: 400 }), // week of 8/16
    ];
    const weeks = groupSavingsByWeek(items);
    expect(weeks).toEqual([
      { weekStart: "2026-08-16", weekEnd: "2026-08-22", total: 400, count: 1 },
      { weekStart: "2026-08-09", weekEnd: "2026-08-15", total: 300, count: 2 },
    ]);
  });
});

describe("savingsPerDayMap", () => {
  it("sums estimated_saving per date", () => {
    const items = [
      item({ date: "2026-08-10", estimated_saving: 150 }),
      item({ date: "2026-08-10", estimated_saving: 50 }),
      item({ date: "2026-08-11", estimated_saving: 300 }),
    ];
    expect(savingsPerDayMap(items)).toEqual({ "2026-08-10": 200, "2026-08-11": 300 });
  });

  it("returns an empty object for no items", () => {
    expect(savingsPerDayMap([])).toEqual({});
  });
});
