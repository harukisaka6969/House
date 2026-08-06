import { describe, it, expect } from "vitest";
import { nextOccurrence, resolveNextDate } from "@/lib/reminderRecurrence";

describe("nextOccurrence", () => {
  it("daily always returns the given date", () => {
    expect(nextOccurrence({ recurrence_type: "daily", day_of_week: null, day_of_month: null }, "2026-08-04")).toBe("2026-08-04");
  });

  describe("weekly", () => {
    it("returns today if today is already the target weekday", () => {
      // 2026-08-04 is a Tuesday (2)
      expect(nextOccurrence({ recurrence_type: "weekly", day_of_week: 2, day_of_month: null }, "2026-08-04")).toBe("2026-08-04");
    });
    it("returns the next occurrence within the week", () => {
      // from Tuesday 08-04, next Friday (5) is 08-07
      expect(nextOccurrence({ recurrence_type: "weekly", day_of_week: 5, day_of_month: null }, "2026-08-04")).toBe("2026-08-07");
    });
    it("wraps to next week if the target day already passed this week", () => {
      // from Tuesday 08-04, next Monday (1) is 08-10
      expect(nextOccurrence({ recurrence_type: "weekly", day_of_week: 1, day_of_month: null }, "2026-08-04")).toBe("2026-08-10");
    });
  });

  describe("monthly", () => {
    it("returns this month's date if it hasn't passed yet", () => {
      expect(nextOccurrence({ recurrence_type: "monthly", day_of_week: null, day_of_month: 15 }, "2026-08-04")).toBe("2026-08-15");
    });
    it("returns today if today is the target day", () => {
      expect(nextOccurrence({ recurrence_type: "monthly", day_of_week: null, day_of_month: 4 }, "2026-08-04")).toBe("2026-08-04");
    });
    it("rolls over to next month if the target day already passed", () => {
      expect(nextOccurrence({ recurrence_type: "monthly", day_of_week: null, day_of_month: 1 }, "2026-08-04")).toBe("2026-09-01");
    });
    it("clamps to the last day of a short month (e.g. day 31 in a 30-day or Feb month)", () => {
      expect(nextOccurrence({ recurrence_type: "monthly", day_of_week: null, day_of_month: 31 }, "2026-02-01")).toBe("2026-02-28");
      expect(nextOccurrence({ recurrence_type: "monthly", day_of_week: null, day_of_month: 31 }, "2026-04-01")).toBe("2026-04-30");
    });
    it("rolls over correctly across a year boundary", () => {
      expect(nextOccurrence({ recurrence_type: "monthly", day_of_week: null, day_of_month: 1 }, "2026-12-15")).toBe("2027-01-01");
    });
  });
});

describe("resolveNextDate", () => {
  it("shows today as next when not yet completed", () => {
    const r = { recurrence_type: "daily" as const, day_of_week: null, day_of_month: null, last_completed_date: null };
    expect(resolveNextDate(r, "2026-08-04")).toEqual({ next_date: "2026-08-04", done_today: false });
  });

  it("advances a daily reminder to tomorrow once completed today", () => {
    const r = { recurrence_type: "daily" as const, day_of_week: null, day_of_month: null, last_completed_date: "2026-08-04" };
    expect(resolveNextDate(r, "2026-08-04")).toEqual({ next_date: "2026-08-05", done_today: true });
  });

  it("ignores a stale completion from a previous occurrence", () => {
    // weekly Tuesday, completed last week — today (also a Tuesday) should still show as due
    const r = { recurrence_type: "weekly" as const, day_of_week: 2, day_of_month: null, last_completed_date: "2026-07-28" };
    expect(resolveNextDate(r, "2026-08-04")).toEqual({ next_date: "2026-08-04", done_today: false });
  });

  it("advances a monthly reminder to next month once completed today", () => {
    const r = { recurrence_type: "monthly" as const, day_of_week: null, day_of_month: 4, last_completed_date: "2026-08-04" };
    expect(resolveNextDate(r, "2026-08-04")).toEqual({ next_date: "2026-09-04", done_today: true });
  });
});
