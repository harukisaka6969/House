import { describe, it, expect } from "vitest";
import { accountChangeButtons, parseAccountPostback, shortAccountName, categoryForAccount } from "@/lib/lineAccount";

const ACCOUNTS = [
  { id: "a1", name: "第1口座（生活費）" },
  { id: "a2", name: "第2口座（ローン等）" },
  { id: "a3", name: "第3口座（趣味・娯楽・交際）" },
  { id: "a4", name: "第4口座（投資）" },
  { id: "a5", name: "第5口座（特別支出）" },
];

describe("accountChangeButtons", () => {
  it("offers every account except the one all entries already use", () => {
    const buttons = accountChangeButtons(["e1", "e2"], ["a1", "a1"], ACCOUNTS);
    expect(buttons.map((b) => b.label)).toEqual(["第2口座に変更", "第3口座に変更", "第4口座に変更", "第5口座に変更"]);
    expect(buttons[1]).toEqual({ label: "第3口座に変更", data: "acct:a3:e1,e2", displayText: "口座を第3口座に変更" });
  });

  it("offers every account when the entries were split across accounts", () => {
    expect(accountChangeButtons(["e1", "e2"], ["a1", "a3"], ACCOUNTS)).toHaveLength(5);
  });

  it("returns no buttons when nothing was registered", () => {
    expect(accountChangeButtons([], [], ACCOUNTS)).toEqual([]);
  });
});

describe("parseAccountPostback", () => {
  it("round-trips the button data", () => {
    expect(parseAccountPostback("acct:a3:e1,e2")).toEqual({ accountId: "a3", ids: ["e1", "e2"] });
  });

  it("ignores other postbacks and malformed data", () => {
    expect(parseAccountPostback("paidby:e1")).toBeNull();
    expect(parseAccountPostback("acct:a3:")).toBeNull();
    expect(parseAccountPostback("acct::e1")).toBeNull();
  });
});

describe("shortAccountName", () => {
  it("drops the parenthesised description", () => {
    expect(shortAccountName("第3口座（趣味・娯楽・交際）")).toBe("第3口座");
    expect(shortAccountName("旅行用")).toBe("旅行用");
  });
});

describe("categoryForAccount", () => {
  it("keeps categories the new account allows", () => {
    expect(categoryForAccount("外食", "a1")).toBe("外食");
    expect(categoryForAccount("外食", "a3")).toBe("外食");
    expect(categoryForAccount("食費", "a5")).toBe("食費");
  });

  it("maps categories the new account cannot use", () => {
    expect(categoryForAccount("食費", "a3")).toBe("外食");
    expect(categoryForAccount("日用品", "a3")).toBe("その他");
    expect(categoryForAccount("趣味", "a1")).toBe("その他");
  });
});
