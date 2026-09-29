import { describe, it, expect } from "vitest";
import { parseSplitHint, isSplitOnlyMessage, findMentionedPersonId } from "@/lib/splitText";

/** 「3人で夜ご飯を食べて50,000円だった。2人分。」を送ったら、自分たちの負担を2/3にするための判定。 */
describe("parseSplitHint", () => {
  it("合計人数と負担人数を読み取る", () => {
    expect(parseSplitHint("3人で夜ご飯を食べて50,000円だった。2人分。")).toEqual({ num: 2, den: 3 });
    expect(parseSplitHint("3人で夜ご飯を食べて50,000円だった。1人分。")).toEqual({ num: 1, den: 3 });
    expect(parseSplitHint("4人で飲み会 20000円 2人分")).toEqual({ num: 2, den: 4 });
  });

  it("全角・漢数字・名・ひらがな表記でも読み取る", () => {
    expect(parseSplitHint("３人で夜ご飯を食べて５０，０００円だった。２人分。")).toEqual({ num: 2, den: 3 });
    expect(parseSplitHint("三人で焼肉 30000円 二人分")).toEqual({ num: 2, den: 3 });
    expect(parseSplitHint("4名で食事 12000円 2名分")).toEqual({ num: 2, den: 4 });
    expect(parseSplitHint("ふたりで食事 8000円 ひとり分")).toEqual({ num: 1, den: 2 });
  });

  it("語順が逆でも読み取る", () => {
    expect(parseSplitHint("2人分だけ払う。5人でご飯 25000円")).toEqual({ num: 2, den: 5 });
  });

  it("割り勘でない文章はnull", () => {
    expect(parseSplitHint("3人で夜ご飯を食べて50000円だった")).toBeNull(); // 負担人数の指定なし
    expect(parseSplitHint("夜ご飯 50000円 2人分")).toBeNull(); // 合計人数が不明
    expect(parseSplitHint("2人で食事 5000円 2人分")).toBeNull(); // 全員分＝割り勘なし
    expect(parseSplitHint("コンビニで480円")).toBeNull();
    expect(parseSplitHint("")).toBeNull();
  });

  it("人数として不自然な数は拾わない", () => {
    expect(parseSplitHint("100人で食事 50000円 2人分")).toBeNull();
  });
});

/** レシートの写真を送った直後に「3人で2人分」と送って、直前の支出に割り勘を適用する判定。 */
describe("isSplitOnlyMessage", () => {
  it("人数だけのメッセージを割り勘指示とみなす", () => {
    expect(isSplitOnlyMessage("3人で2人分")).toBe(true);
    expect(isSplitOnlyMessage("４人で２人分")).toBe(true);
    expect(isSplitOnlyMessage("4人で食事 2人分")).toBe(true);
  });

  it("金額を含む文章・人数が足りない文章は対象外", () => {
    expect(isSplitOnlyMessage("3人で夜ご飯を食べて50000円だった。2人分。")).toBe(false);
    expect(isSplitOnlyMessage("2人分")).toBe(false);
    expect(isSplitOnlyMessage("3人で")).toBe(false);
    expect(isSplitOnlyMessage("")).toBe(false);
  });
});

describe("findMentionedPersonId", () => {
  const people = [
    { id: "p-haruki", name: "遥希" },
    { id: "p-arisa", name: "アリサ" },
  ];

  it("文中に出ている名前の人を返す", () => {
    expect(findMentionedPersonId("アリサと2人で食事 8000円 1人分", people)).toBe("p-arisa");
    expect(findMentionedPersonId("遥希だけ参加 1人分", people)).toBe("p-haruki");
  });

  it("ひらがな・カタカナの違いを吸収する", () => {
    expect(findMentionedPersonId("ありさと3人で食事 1人分", people)).toBe("p-arisa");
  });

  it("名前が出ていなければnull", () => {
    expect(findMentionedPersonId("3人で食事 15000円 1人分", people)).toBeNull();
  });
});
