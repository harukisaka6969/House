import { describe, it, expect } from "vitest";
import { parseAdvanceKeyword, isAdvanceOnlyMessage, isCancelMessage } from "@/lib/lineAdvance";

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

describe("表記ゆれの許容（立替）", () => {
  it("漢字・ひらがな・カタカナ・送り仮名の違いを吸収する", () => {
    for (const t of ["立替", "立て替え", "立替え", "たてかえ", "タテカエ", "たて替え", "立てかえ"]) {
      expect(parseAdvanceKeyword(t)?.command, t).toBe("set");
    }
  });

  it("「建て替え」のような変換ミス・「立て変え」のような誤字も拾う", () => {
    for (const t of ["建て替え", "建替", "建てかえ", "立て変え", "立て換え", "タテ替え"]) {
      expect(parseAdvanceKeyword(t)?.command, t).toBe("set");
    }
  });

  it("全角数字・全角スペースが混ざっていても金額付きとして扱う", () => {
    expect(isAdvanceOnlyMessage("コスメ　３８００円　立替")).toBe(false);
  });

  it("解除の表記ゆれも吸収する", () => {
    for (const t of ["立替取消", "たてかえ取り消し", "建て替え キャンセル", "立替 解除", "タテカエなし"]) {
      expect(parseAdvanceKeyword(t)?.command, t).toBe("clear");
    }
  });
});

describe("isCancelMessage", () => {
  it("取り消し系の表記ゆれを受け付ける", () => {
    for (const t of ["取り消し", "取消", "とりけし", "トリケシ", "キャンセル", "削除", "消して", "取り消して", "やっぱなし"]) {
      expect(isCancelMessage(t), t).toBe(true);
    }
  });

  it("立替の解除は取り消しとして扱わない（別処理のため）", () => {
    expect(isCancelMessage("立替 取消")).toBe(false);
    expect(isCancelMessage("たてかえキャンセル")).toBe(false);
  });

  it("通常の記録メッセージは取り消しではない", () => {
    expect(isCancelMessage("コンビニで480円")).toBe(false);
    expect(isCancelMessage("朝ごはんは卵かけご飯")).toBe(false);
  });

  it("長文に偶然含まれた場合は無視する", () => {
    expect(isCancelMessage("今日は予定が取り消しになったので家で作業して夕飯は自炊した")).toBe(false);
  });
});
