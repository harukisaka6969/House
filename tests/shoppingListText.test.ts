import { describe, it, expect } from "vitest";
import { parseShoppingListMessage, extractUrl } from "@/lib/shoppingListText";

describe("parseShoppingListMessage", () => {
  it("「買い物リスト」だけなら西友リストの送信", () => {
    expect(parseShoppingListMessage("買い物リスト")).toEqual({ kind: "send" });
    expect(parseShoppingListMessage("買物リスト")).toEqual({ kind: "send" });
  });

  it("「買い物リスト確認」は見るだけ（購入済みにしない）", () => {
    for (const t of ["買い物リスト確認", "買い物リストを確認", "買い物リスト チェック", "買い物リスト見せて", "買い物リストは？"]) {
      expect(parseShoppingListMessage(t), t).toEqual({ kind: "show" });
    }
  });

  it("「買い物リスト」の前に書かれた商品は西友リストに追加", () => {
    expect(parseShoppingListMessage("醤油買い物リスト")).toEqual({
      kind: "add",
      store: "seiyu",
      items: [{ name: "醤油", url: null }],
    });
    expect(parseShoppingListMessage("醤油 買い物リストに追加")).toEqual({
      kind: "add",
      store: "seiyu",
      items: [{ name: "醤油", url: null }],
    });
    expect(parseShoppingListMessage("醤油、味噌、米 買い物リスト")).toEqual({
      kind: "add",
      store: "seiyu",
      items: [
        { name: "醤油", url: null },
        { name: "味噌", url: null },
        { name: "米", url: null },
      ],
    });
  });

  it("Amazon指定はAmazonリストに追加し、リンクも拾う", () => {
    expect(parseShoppingListMessage("Amazon醤油 https://www.amazon.co.jp/dp/B000123")).toEqual({
      kind: "add",
      store: "amazon",
      items: [{ name: "醤油", url: "https://www.amazon.co.jp/dp/B000123" }],
    });
    // スキームが無い書き方でも補う
    expect(parseShoppingListMessage("Amazon醤油 example.com/soy")).toEqual({
      kind: "add",
      store: "amazon",
      items: [{ name: "醤油", url: "https://example.com/soy" }],
    });
    // リンクが無くてもAmazonリストに追加できる
    expect(parseShoppingListMessage("アマゾン 醤油")).toEqual({
      kind: "add",
      store: "amazon",
      items: [{ name: "醤油", url: null }],
    });
    // 「買い物リスト」と一緒に書かれていてもAmazon側に入る
    expect(parseShoppingListMessage("Amazon醤油買い物リスト")).toEqual({
      kind: "add",
      store: "amazon",
      items: [{ name: "醤油", url: null }],
    });
  });

  it("Amazonでの支出報告はリスト追加とみなさない", () => {
    expect(parseShoppingListMessage("Amazonで本を1200円買った")).toBeNull();
  });

  it("買い物リストと関係ない文章はnull", () => {
    expect(parseShoppingListMessage("コンビニで480円")).toBeNull();
    expect(parseShoppingListMessage("朝ごはんは卵かけご飯")).toBeNull();
    expect(parseShoppingListMessage("")).toBeNull();
  });
});

describe("extractUrl", () => {
  it("URLと残りの文字列に分ける", () => {
    expect(extractUrl("醤油 https://a.example.com/x?y=1")).toEqual({ url: "https://a.example.com/x?y=1", rest: "醤油" });
    expect(extractUrl("醤油 amzn.asia/d/abc")).toEqual({ url: "https://amzn.asia/d/abc", rest: "醤油" });
    expect(extractUrl("醤油")).toEqual({ url: null, rest: "醤油" });
  });
});
