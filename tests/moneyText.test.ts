import { describe, it, expect } from "vitest";
import { containsMoneyAmount } from "@/lib/moneyText";

/** 「お昼ご飯にうどん500円」が食事としてだけ記録され、支出が登録されない問題への対応。
 * 金額が書かれていれば必ず支出としても登録するため、その判定をここで検証する。 */
describe("containsMoneyAmount", () => {
  it("食事の説明に金額が混ざっている文章を金額ありと判定する", () => {
    expect(containsMoneyAmount("お昼ご飯にうどん500円")).toBe(true);
    expect(containsMoneyAmount("夜はラーメン900円と餃子400円")).toBe(true);
  });

  it("よくある金額表記を拾う", () => {
    for (const t of ["コンビニで480円", "1,200円", "1万円", "1.5万円", "¥980", "￥1,200", "500 円", "三千円"]) {
      expect(containsMoneyAmount(t), t).toBe(true);
    }
  });

  it("金額でない数量表記は拾わない", () => {
    for (const t of ["ベンチプレス60kg10回8回8回", "ヨーグルト300グラム", "10000歩あるいた", "体重72.5kg"]) {
      expect(containsMoneyAmount(t), t).toBe(false);
    }
  });

  it("金額が無い文章はfalse", () => {
    expect(containsMoneyAmount("朝ごはんは卵かけご飯")).toBe(false);
    expect(containsMoneyAmount("リビングの照明つけて")).toBe(false);
    expect(containsMoneyAmount("")).toBe(false);
  });

  it("全角数字でも判定できる", () => {
    expect(containsMoneyAmount("うどん５００円")).toBe(true);
  });
});
