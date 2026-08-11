import { describe, it, expect } from "vitest";
import { isValidPatternSequence, patternToCode, isValidPatternCode, PATTERN_MIN_NODES, PATTERN_MAX_NODES } from "@/lib/pattern";

describe("isValidPatternSequence", () => {
  it("accepts a typical 5-node pattern", () => {
    expect(isValidPatternSequence([1, 2, 3, 6, 9])).toBe(true);
  });

  it("accepts the minimum length (4 nodes)", () => {
    expect(isValidPatternSequence([1, 2, 3, 4])).toBe(true);
  });

  it("accepts the maximum length (all 9 nodes)", () => {
    expect(isValidPatternSequence([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(true);
  });

  it("rejects fewer than the minimum nodes", () => {
    expect(isValidPatternSequence([1, 2, 3])).toBe(false);
  });

  it("rejects more than 9 nodes", () => {
    expect(isValidPatternSequence([1, 2, 3, 4, 5, 6, 7, 8, 9, 1])).toBe(false);
  });

  it("rejects repeated nodes", () => {
    expect(isValidPatternSequence([1, 2, 3, 2])).toBe(false);
  });

  it("rejects out-of-range node ids", () => {
    expect(isValidPatternSequence([0, 1, 2, 3])).toBe(false);
    expect(isValidPatternSequence([1, 2, 3, 10])).toBe(false);
  });

  it("rejects non-integer values", () => {
    expect(isValidPatternSequence([1, 2, 3, 4.5])).toBe(false);
  });

  it("matches the documented min/max constants", () => {
    expect(PATTERN_MIN_NODES).toBe(4);
    expect(PATTERN_MAX_NODES).toBe(9);
  });
});

describe("patternToCode", () => {
  it("joins nodes into a digit string", () => {
    expect(patternToCode([1, 4, 7, 8, 9])).toBe("14789");
  });

  it("throws for an invalid pattern", () => {
    expect(() => patternToCode([1, 2])).toThrow();
  });
});

describe("isValidPatternCode", () => {
  it("accepts a code produced by patternToCode", () => {
    expect(isValidPatternCode(patternToCode([1, 4, 7, 8, 9]))).toBe(true);
  });

  it("rejects codes containing 0", () => {
    expect(isValidPatternCode("1230")).toBe(false);
  });

  it("rejects codes with repeated digits", () => {
    expect(isValidPatternCode("1231")).toBe(false);
  });

  it("rejects codes shorter than the minimum", () => {
    expect(isValidPatternCode("123")).toBe(false);
  });

  it("rejects non-digit input", () => {
    expect(isValidPatternCode("abcd")).toBe(false);
  });

  it("round-trips through a string the same way it would arrive over JSON", () => {
    const nodes = [9, 8, 7, 4, 1, 2];
    const code = patternToCode(nodes);
    expect(code.split("").map(Number)).toEqual(nodes);
    expect(isValidPatternCode(code)).toBe(true);
  });
});
