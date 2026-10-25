import { describe, it, expect } from "vitest";
import { normalizeReceiptDate } from "@/lib/receiptDate";

const TODAY = "2026-10-25";

describe("normalizeReceiptDate", () => {
  it("accepts ISO and common western formats", () => {
    expect(normalizeReceiptDate("2026-10-24", TODAY)).toBe("2026-10-24");
    expect(normalizeReceiptDate("2026/10/4", TODAY)).toBe("2026-10-04");
    expect(normalizeReceiptDate("2026.10.24 18:32", TODAY)).toBe("2026-10-24");
    expect(normalizeReceiptDate("2026年10月24日(土)", TODAY)).toBe("2026-10-24");
    expect(normalizeReceiptDate("２０２６年１０月２４日", TODAY)).toBe("2026-10-24");
    expect(normalizeReceiptDate("20261024", TODAY)).toBe("2026-10-24");
  });

  it("converts 2-digit years and Japanese era years", () => {
    expect(normalizeReceiptDate("26/10/24", TODAY)).toBe("2026-10-24");
    expect(normalizeReceiptDate("R8.10.24", TODAY)).toBe("2026-10-24");
    expect(normalizeReceiptDate("令和8年10月24日", TODAY)).toBe("2026-10-24");
    expect(normalizeReceiptDate("令和元年5月1日", "2019-05-01")).toBe("2019-05-01");
    expect(normalizeReceiptDate("H31.4.30", "2019-05-01")).toBe("2019-04-30");
  });

  it("fills in a missing year with the closest past year", () => {
    expect(normalizeReceiptDate("10月24日", TODAY)).toBe("2026-10-24");
    expect(normalizeReceiptDate("12/30", TODAY)).toBe("2025-12-30");
    expect(normalizeReceiptDate("10/26", TODAY)).toBe("2026-10-26");
  });

  it("fixes a misread year to this year, but never into the future", () => {
    expect(normalizeReceiptDate("2020-09-26", "2026-09-26")).toBe("2026-09-26");
    expect(normalizeReceiptDate("2022/08/22", "2026-08-22")).toBe("2026-08-22");
    expect(normalizeReceiptDate("1999-01-01", TODAY)).toBe("2026-01-01");
    expect(normalizeReceiptDate("2024/08/26", "2026-08-16")).toBeNull();
    expect(normalizeReceiptDate("2027-10-24", TODAY)).toBe("2026-10-24");
  });

  it("keeps a genuinely older receipt within the last year as written", () => {
    expect(normalizeReceiptDate("2026/05/10", TODAY)).toBe("2026-05-10");
    expect(normalizeReceiptDate("2025/12/01", TODAY)).toBe("2025-12-01");
  });

  it("reads day/month-or-month/day foreign dates as the one closest to today", () => {
    expect(normalizeReceiptDate("05/10/2026", "2026-10-05")).toBe("2026-10-05");
    expect(normalizeReceiptDate("10/05/2026 14:22", "2026-10-05")).toBe("2026-10-05");
    expect(normalizeReceiptDate("24/10/2026", TODAY)).toBe("2026-10-24");
    expect(normalizeReceiptDate("10/24/2026", TODAY)).toBe("2026-10-24");
  });

  it("rejects future, impossible or unreadable dates", () => {
    expect(normalizeReceiptDate("2026-11-01", TODAY)).toBeNull();
    expect(normalizeReceiptDate("2026-02-30", TODAY)).toBeNull();
    expect(normalizeReceiptDate("不明", TODAY)).toBeNull();
    expect(normalizeReceiptDate(null, TODAY)).toBeNull();
    expect(normalizeReceiptDate("", TODAY)).toBeNull();
  });
});
