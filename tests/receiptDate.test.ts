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
    expect(normalizeReceiptDate("令和元年5月1日", TODAY)).toBe("2019-05-01");
    expect(normalizeReceiptDate("H31.4.30", TODAY)).toBe("2019-04-30");
  });

  it("fills in a missing year with the closest past year", () => {
    expect(normalizeReceiptDate("10月24日", TODAY)).toBe("2026-10-24");
    expect(normalizeReceiptDate("12/30", TODAY)).toBe("2025-12-30");
    expect(normalizeReceiptDate("10/26", TODAY)).toBe("2026-10-26");
  });

  it("rejects future, impossible or unreadable dates", () => {
    expect(normalizeReceiptDate("2026-11-01", TODAY)).toBeNull();
    expect(normalizeReceiptDate("2026-02-30", TODAY)).toBeNull();
    expect(normalizeReceiptDate("1999-01-01", TODAY)).toBeNull();
    expect(normalizeReceiptDate("不明", TODAY)).toBeNull();
    expect(normalizeReceiptDate(null, TODAY)).toBeNull();
    expect(normalizeReceiptDate("", TODAY)).toBeNull();
  });
});
