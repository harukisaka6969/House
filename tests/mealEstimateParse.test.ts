import { describe, it, expect } from "vitest";
import { extractJsonObject, toMealEstimate } from "@/lib/aiJson";

/** web_searchを有効にしていると、AIの応答はJSONの前後に説明文が混ざることがある。
 * 以前はレスポンス全体をJSON.parseしていたため、写真からの食事登録がほぼ必ず失敗していた。 */
describe("extractJsonObject", () => {
  it("そのままのJSONを解析できる", () => {
    expect(extractJsonObject('{"calories":100}')).toEqual({ calories: 100 });
  });

  it("コードブロックで囲まれていても解析できる", () => {
    expect(extractJsonObject('```json\n{"calories":250}\n```')).toEqual({ calories: 250 });
  });

  it("説明文が前後に混ざっていてもJSONだけ取り出せる", () => {
    const raw = `この商品の栄養成分を検索します。
検索結果によると1缶あたり52kcalでした。
{"description":"シーチキンマイルド1缶","calories":52,"protein_g":12,"fat_g":0.3,"carb_g":0.4}
以上が推定値です。`;
    expect(extractJsonObject(raw)).toEqual({
      description: "シーチキンマイルド1缶",
      calories: 52,
      protein_g: 12,
      fat_g: 0.3,
      carb_g: 0.4,
    });
  });

  it("複数のJSONらしき塊があれば最後の有効なものを返す", () => {
    const raw = `例: {"description":"例","calories":0}
最終的な回答:
{"description":"親子丼","calories":700,"protein_g":30,"fat_g":20,"carb_g":90}`;
    expect(extractJsonObject(raw)).toMatchObject({ description: "親子丼", calories: 700 });
  });

  it("文字列の中の波括弧に惑わされない", () => {
    const raw = '{"description":"謎の料理{カッコ入り}","calories":300,"protein_g":10,"fat_g":5,"carb_g":40}';
    expect(extractJsonObject(raw)).toMatchObject({ description: "謎の料理{カッコ入り}", calories: 300 });
  });

  it("途中で切れた応答ではnullを返す（呼び出し側が検索なしで再試行する）", () => {
    expect(extractJsonObject('検索しています…\n{"description":"親子丼","calo')).toBeNull();
  });

  it("JSONが無ければnull", () => {
    expect(extractJsonObject("すみません、判別できませんでした。")).toBeNull();
  });
});

describe("toMealEstimate", () => {
  it("数値が文字列で返ってきても数値に変換する", () => {
    expect(toMealEstimate({ description: "カレー", calories: "800", protein_g: "20", fat_g: "25", carb_g: "100" })).toEqual({
      description: "カレー",
      calories: 800,
      protein_g: 20,
      fat_g: 25,
      carb_g: 100,
    });
  });

  it("PFCが欠けていても0扱いで記録できる", () => {
    expect(toMealEstimate({ description: "お茶", calories: 0 })).toEqual({
      description: "お茶",
      calories: 0,
      protein_g: 0,
      fat_g: 0,
      carb_g: 0,
    });
  });

  it("caloriesが無い・数値でないものは不正としてnull", () => {
    expect(toMealEstimate({ description: "不明" })).toBeNull();
    expect(toMealEstimate({ description: "不明", calories: "たぶん500くらい" })).toBeNull();
    expect(toMealEstimate(null)).toBeNull();
  });
});
