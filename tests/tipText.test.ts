import { describe, it, expect } from "vitest";
import { extractTag, extractOutputContent, isUsableTipContent, selectDueTips } from "@/lib/tipText";

/** 毎日の記事（生活tips）の生成が失敗していた問題への対応。
 * 「本日分の生成に失敗しました。」や検索中の独り言がそのままLINEに送られていたため、
 * 送る前の検品をここで検証する。 */
describe("extractOutputContent", () => {
  it("<output>タグの中身を取り出す", () => {
    const raw = "検索しました。<output>今日のニュースです。物価が上がりました。</output><summary>物価上昇</summary>";
    expect(extractOutputContent(raw)).toBe("今日のニュースです。物価が上がりました。");
  });

  it("閉じタグが無くても開始タグ以降を使う（上限で切れた場合）", () => {
    expect(extractOutputContent("前置き<output>本文がここから始まる")).toBe("本文がここから始まる");
  });

  it("タグが無ければ全体を使う", () => {
    expect(extractOutputContent(" 本文だけ ")).toBe("本文だけ");
  });
});

describe("extractTag", () => {
  it("summaryを取り出す", () => {
    expect(extractTag("<output>本文</output><summary>要約です</summary>", "summary")).toBe("要約です");
  });

  it("無ければ空文字", () => {
    expect(extractTag("<output>本文</output>", "summary")).toBe("");
  });
});

describe("isUsableTipContent", () => {
  it("日本語の記事は送れる", () => {
    const article =
      "10月3日は家計に直結する動きが相次いだ一日だった。電気・ガス料金の値上げが発表され、食料品の価格にも影響が出そうだ。日銀の金融政策にも注目が集まっている。";
    expect(isUsableTipContent(article)).toBe(true);
  });

  it("生成失敗の置き換え文のような短い文は送らない", () => {
    expect(isUsableTipContent("本日分の生成に失敗しました。")).toBe(false);
    expect(isUsableTipContent("")).toBe(false);
  });

  it("検索中の独り言（英語）は送らない", () => {
    expect(isUsableTipContent("Now I have enough material to write the digest. Let me compose it carefully.")).toBe(false);
    expect(isUsableTipContent("Good, results are found. Let me get more details on these and then write the digest.")).toBe(false);
  });

  it("タグが残っているものは送らない", () => {
    expect(isUsableTipContent("<summary>要約だけが返ってきてしまった場合の長めのテキストです。</summary>")).toBe(false);
  });
});

/** 21:00・23:00・23:30のコーナーが、cronの起動が飛んだ日に送られないまま終わっていた問題への対応。
 * 深夜（朝5時まで）は前日分としても送れるようにする。 */
describe("selectDueTips", () => {
  const defs = [
    { time: "06:00", name: "news" },
    { time: "12:00", name: "health" },
    { time: "18:00", name: "philosophy" },
    { time: "21:00", name: "wellbeing" },
    { time: "23:30", name: "fashion" },
  ];
  const today = "2026-10-05";

  it("予定時刻を過ぎたコーナーを当日分として返す", () => {
    expect(selectDueTips(defs, "12:30", today)).toEqual([
      { def: defs[0], date: today },
      { def: defs[1], date: today },
    ]);
  });

  it("深夜は、前日の夜に送れなかったコーナーを前日分として先に返す", () => {
    const due = selectDueTips(defs, "00:45", today);
    expect(due).toEqual([
      { def: defs[2], date: "2026-10-04" },
      { def: defs[3], date: "2026-10-04" },
      { def: defs[4], date: "2026-10-04" },
    ]);
  });

  it("朝5時を過ぎたら前日分はあきらめる", () => {
    expect(selectDueTips(defs, "05:00", today)).toEqual([]);
    expect(selectDueTips(defs, "06:15", today)).toEqual([{ def: defs[0], date: today }]);
  });

  it("夜のコーナーも、当日中に予定時刻を過ぎていれば当日分として返す", () => {
    const due = selectDueTips(defs, "23:45", today);
    expect(due.every((d) => d.date === today)).toBe(true);
    expect(due).toHaveLength(5);
  });
});
