import { describe, it, expect } from "vitest";
import { parseParkingResearch } from "@/lib/parkingParse";

/** Web検索つきの応答は説明文が混ざる・トークン上限で途中で切れることがあり、
 * 素直にJSON.parseするとoptionsが空になって「駐車場情報が見つかりませんでした」と
 * 表示されてしまっていた（渋谷スクランブルスクエアのような有名な場所でも発生）。 */
const option = (name: string, cost: number) =>
  `{"type":"徒歩併用","name":"${name}","estimated_cost":${cost},"walk_minutes":6,"notes":"相場からの推定","timing_advice":null}`;

describe("parseParkingResearch", () => {
  it("正常なJSONを解析できる", () => {
    const raw = `{"destination":"渋谷スクランブルスクエア","options":[${option("渋谷駅東口第一駐車場", 2400)}],"general_notes":"補足"}`;
    const r = parseParkingResearch(raw, "渋谷スクランブルスクエア");
    expect(r?.destination).toBe("渋谷スクランブルスクエア");
    expect(r?.options).toHaveLength(1);
    expect(r?.options[0]).toMatchObject({ name: "渋谷駅東口第一駐車場", estimated_cost: 2400, walk_minutes: 6 });
  });

  it("検索の説明文が前後に混ざっていても解析できる", () => {
    const raw = `渋谷スクランブルスクエア周辺の駐車場を検索します。
検索結果を確認しました。
{"destination":"渋谷スクランブルスクエア","options":[${option("渋谷駅周辺コインパーキング", 2000)}],"general_notes":""}
以上です。`;
    expect(parseParkingResearch(raw, "渋谷スクランブルスクエア")?.options).toHaveLength(1);
  });

  it("外側のJSONが途中で切れていても、完成している提案は拾える", () => {
    const raw = `{"destination":"大宮こころのクリニック","options":[${option("大宮駅西口パーキング", 800)},${option("さいたま新都心の安い駐車場", 500)},{"type":"電車のみ","name":"蕨駅から大宮駅",`;
    const r = parseParkingResearch(raw, "大宮こころのクリニック");
    expect(r).not.toBeNull();
    expect(r!.options.length).toBeGreaterThanOrEqual(2);
    expect(r!.destination).toBe("大宮こころのクリニック");
  });

  it("options配列を持つ候補が複数あれば件数の多いほうを採る", () => {
    const raw = `例: {"destination":"例","options":[${option("例の駐車場", 100)}]}
最終回答:
{"destination":"エニタイムフィットネス蕨店","options":[${option("蕨駅西口駐車場", 400)},${option("無料の店舗提携駐車場", 0)},${option("1駅手前の西川口で停める", 300)}],"general_notes":""}`;
    const r = parseParkingResearch(raw, "エニタイムフィットネス蕨店");
    expect(r?.options).toHaveLength(3);
    expect(r?.destination).toBe("エニタイムフィットネス蕨店");
  });

  it("数値が文字列・徒歩分数が欠けていても正規化して受け付ける", () => {
    const raw = '{"destination":"X","options":[{"type":"無料","name":"無料駐車場","estimated_cost":"0","notes":"2時間まで無料"}]}';
    expect(parseParkingResearch(raw, "X")?.options[0]).toEqual({
      type: "無料",
      name: "無料駐車場",
      estimated_cost: 0,
      walk_minutes: null,
      notes: "2時間まで無料",
      timing_advice: null,
    });
  });

  it("options自体が空の応答はnull（呼び出し側で検索なしのやり直しに回す）", () => {
    expect(parseParkingResearch('{"destination":"渋谷","options":[],"general_notes":"見つかりませんでした"}', "渋谷")).toBeNull();
  });

  it("JSONが全く無ければnull", () => {
    expect(parseParkingResearch("申し訳ありませんが、情報が見つかりませんでした。", "渋谷")).toBeNull();
  });

  it("目的地が空文字なら入力した行き先で補う", () => {
    const raw = `{"destination":"","options":[${option("どこかの駐車場", 300)}]}`;
    expect(parseParkingResearch(raw, "エニタイムフィットネス蕨店")?.destination).toBe("エニタイムフィットネス蕨店");
  });
});
