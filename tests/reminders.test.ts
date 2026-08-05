import { describe, it, expect } from "vitest";
import { nextOccurrence } from "@/lib/reminderRecurrence";

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
