import { describe, it, expect, afterEach, vi } from "vitest";
import { periodKeyOfDate, periodRange, periodEndInclusive, shiftMonth, businessDateJST } from "@/lib/date";

describe("periodKeyOfDate (25日始まり・翌月24日締め)", () => {
  it("day >= 25 belongs to that calendar month's label", () => {
    expect(periodKeyOfDate("2026-07-25")).toBe("2026-07");
    expect(periodKeyOfDate("2026-07-31")).toBe("2026-07");
  });

  it("day < 25 belongs to the previous calendar month's label", () => {
    expect(periodKeyOfDate("2026-08-01")).toBe("2026-07");
    expect(periodKeyOfDate("2026-08-24")).toBe("2026-07");
    expect(periodKeyOfDate("2026-08-25")).toBe("2026-08");
  });

  it("wraps correctly across a year boundary", () => {
    expect(periodKeyOfDate("2026-01-10")).toBe("2025-12");
    expect(periodKeyOfDate("2025-12-25")).toBe("2025-12");
  });
});

describe("periodRange / periodEndInclusive", () => {
  it("returns [monthKey-25, nextMonth-25) and inclusive end nextMonth-24", () => {
    const r = periodRange("2026-07");
    expect(r.from).toBe("2026-07-25");
    expect(r.toExclusive).toBe("2026-08-25");
    expect(periodEndInclusive("2026-07")).toBe("2026-08-24");
  });

  it("every date in [from, toExclusive) maps back to the same period key", () => {
    for (const monthKey of ["2026-01", "2026-02", "2026-12"]) {
      const { from } = periodRange(monthKey);
      const end = periodEndInclusive(monthKey);
      expect(periodKeyOfDate(from)).toBe(monthKey);
      expect(periodKeyOfDate(end)).toBe(monthKey);
      const nextDay = shiftMonth(monthKey, 1) + "-25";
      expect(periodKeyOfDate(nextDay)).toBe(shiftMonth(monthKey, 1));
    }
  });
});

describe("businessDateJST (購入・食事の「1日」は午前3:30始まり)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("before 3:30 JST still counts as the previous day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T16:00:00.000Z")); // 2026-04-26 01:00 JST
    expect(businessDateJST()).toBe("2026-04-25");
  });

  it("at 3:29 JST still counts as the previous day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T18:29:00.000Z")); // 2026-04-26 03:29 JST
    expect(businessDateJST()).toBe("2026-04-25");
  });

  it("at exactly 3:30 JST counts as the new day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T18:30:00.000Z")); // 2026-04-26 03:30 JST
    expect(businessDateJST()).toBe("2026-04-26");
  });

  it("during normal daytime hours matches the calendar date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T05:00:00.000Z")); // 2026-04-25 14:00 JST
    expect(businessDateJST()).toBe("2026-04-25");
  });

  it("shifts correctly across a month boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T17:00:00.000Z")); // 2026-05-01 02:00 JST
    expect(businessDateJST()).toBe("2026-04-30");
  });
});
