import { describe, it, expect } from "vitest";
import { computeDiscountSaving, computeDiscountSavingFromOriginal } from "@/lib/discountMath";

describe("computeDiscountSaving", () => {
  it("computes the original price and saving from a paid price and discount percent", () => {
    // 800円が20%オフの支払額なら、定価は1000円、節約は200円
    expect(computeDiscountSaving(800, 20)).toEqual({ originalPrice: 1000, saving: 200 });
  });

  it("rounds to the nearest yen", () => {
    // 700円が30%オフなら定価は700/0.7=1000円ちょうど
    expect(computeDiscountSaving(700, 30)).toEqual({ originalPrice: 1000, saving: 300 });
    // 690円が31%オフなら定価は690/0.69≈1000円
    const r = computeDiscountSaving(690, 31);
    expect(r.originalPrice).toBeGreaterThan(0);
    expect(r.saving).toBe(r.originalPrice - 690);
  });

  it("returns zero saving for a non-positive discount percent", () => {
    expect(computeDiscountSaving(800, 0)).toEqual({ originalPrice: 800, saving: 0 });
    expect(computeDiscountSaving(800, -5)).toEqual({ originalPrice: 800, saving: 0 });
  });

  it("returns zero saving for a discount percent of 100 or more (undefined original price)", () => {
    expect(computeDiscountSaving(800, 100)).toEqual({ originalPrice: 800, saving: 0 });
    expect(computeDiscountSaving(800, 150)).toEqual({ originalPrice: 800, saving: 0 });
  });

  it("returns zero saving for a non-positive price paid", () => {
    expect(computeDiscountSaving(0, 20)).toEqual({ originalPrice: 0, saving: 0 });
    expect(computeDiscountSaving(-100, 20)).toEqual({ originalPrice: 0, saving: 0 });
  });
});

describe("computeDiscountSavingFromOriginal", () => {
  it("computes saving as the difference between original price and price paid", () => {
    expect(computeDiscountSavingFromOriginal(1000, 800)).toEqual({ originalPrice: 1000, saving: 200 });
  });

  it("supports a fully redeemed item (100% off / free via points)", () => {
    // スターバックスの「スター リワード」でポイントを使い切って0円になったケース
    expect(computeDiscountSavingFromOriginal(632, 0)).toEqual({ originalPrice: 632, saving: 632 });
  });

  it("returns zero saving when price paid equals the original price", () => {
    expect(computeDiscountSavingFromOriginal(1000, 1000)).toEqual({ originalPrice: 1000, saving: 0 });
  });

  it("returns zero saving (keeping the known original price) when price paid exceeds the original price", () => {
    expect(computeDiscountSavingFromOriginal(1000, 1200)).toEqual({ originalPrice: 1000, saving: 0 });
  });

  it("returns zero saving (keeping the known original price) for a negative price paid", () => {
    expect(computeDiscountSavingFromOriginal(1000, -1)).toEqual({ originalPrice: 1000, saving: 0 });
  });

  it("returns zero for everything when the original price itself is non-positive", () => {
    expect(computeDiscountSavingFromOriginal(0, 0)).toEqual({ originalPrice: 0, saving: 0 });
    expect(computeDiscountSavingFromOriginal(-100, 0)).toEqual({ originalPrice: 0, saving: 0 });
  });
});
