import { describe, it, expect } from "vitest";
import { parseAdvanceKeyword, isAdvanceOnlyMessage } from "@/lib/lineAdvance";

describe("parseAdvanceKeyword", () => {
  it("支出の文章に混ざった「立替」を読み取り、語を除いた残りを返す", () => {
    expect(parseAdvanceKeyword("コスメ 3800円 立替")).toEqual({ command: "set", rest: "コスメ 3800円" });
  });

  it("表記ゆれ（立て替え・たてかえ）にも対応する", () => {
    expect(parseAdvanceKeyword("美容院 5000円 立て替え")?.command).toBe("set");
    expect(parseAdvanceKeyword("たてかえ ネイル1万円")).toEqual({ command: "set", rest: "ネイル1万円" });
  });

  it("「立替」だけなら設定の指示として読む", () => {
    expect(parseAdvanceKeyword("立替")).toEqual({ command: "set", rest: "" });
  });

  it("取消系の語と一緒なら解除として読む", () => {
    expect(parseAdvanceKeyword("立替 取消")?.command).toBe("clear");
    expect(parseAdvanceKeyword("立替取消")?.command).toBe("clear");
    expect(parseAdvanceKeyword("立替 解除")?.command).toBe("clear");
    expect(parseAdvanceKeyword("立て替え キャンセル")?.command).toBe("clear");
  });

  it("「立替」が無い文章はnull", () => {
    expect(parseAdvanceKeyword("コンビニで480円")).toBeNull();
    expect(parseAdvanceKeyword("")).toBeNull();
  });
});

describe("isAdvanceOnlyMessage", () => {
  it("金額を含まない「立替」だけのメッセージは、直前の記録への適用とみなす", () => {
    expect(isAdvanceOnlyMessage("立替")).toBe(true);
    expect(isAdvanceOnlyMessage("立て替え")).toBe(true);
    expect(isAdvanceOnlyMessage("立替 取消")).toBe(true);
  });

  it("金額を含むメッセージは新しい支出の登録として扱う", () => {
    expect(isAdvanceOnlyMessage("コスメ 3800円 立替")).toBe(false);
    expect(isAdvanceOnlyMessage("たてかえ ネイル1万円")).toBe(false);
  });

  it("「立替」が無いメッセージは対象外", () => {
    expect(isAdvanceOnlyMessage("コンビニで480円")).toBe(false);
  });
});
