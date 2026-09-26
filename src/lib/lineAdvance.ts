/**
 * LINEで送られてきた文章から「立替」の指示を読み取る部分（純粋関数のみ・テストから直接読める）。
 *
 * 第3口座から払うべきものをアリサが自分のカードで立て替える、というケースが多いため、
 * ・支出の文章に「立替」を混ぜて送る（例: 「コスメ 3800円 立替」）
 * ・写真を送った直後に「立替」だけ送る（直前の記録に後から適用する）
 * の両方を同じ書き方で扱えるようにする。
 */

export type AdvanceCommand = "set" | "clear";

const CLEAR_WORDS = ["取消", "取り消し", "解除", "キャンセル", "やめる", "なし"];
/** 「立替」の表記ゆれ。長いものから順に試す。 */
const ADVANCE_WORDS = ["立て替え", "立替え", "たてかえ", "立替"];

export interface AdvanceKeyword {
  /** set=立替として記録、clear=立替を解除。 */
  command: AdvanceCommand;
  /** 「立替」の語を取り除いた残りの文章（支出の解析にはこちらを使う）。 */
  rest: string;
}

/** 文章に「立替」の指示が含まれていれば、その種類と、語を除いた残りの文章を返す。無ければnull。 */
export function parseAdvanceKeyword(text: string): AdvanceKeyword | null {
  const normalized = (text ?? "").trim();
  if (normalized === "") return null;

  const word = ADVANCE_WORDS.find((w) => normalized.includes(w));
  if (!word) return null;

  const rest = normalized.replace(word, " ").replace(/\s+/g, " ").trim();
  // 「立替」の語を除いた残りが取消系の語だけなら解除、それ以外（金額や店名が残っていれば）は設定。
  const isClear = CLEAR_WORDS.some((w) => rest === w || rest.startsWith(w) || rest.endsWith(w));
  return { command: isClear ? "clear" : "set", rest: isClear ? "" : rest };
}

/** 「立替」の指示だけで、支出の内容（金額など）が含まれていないメッセージか。
 * trueなら「直前に登録した支出に後から適用する」操作として扱う。 */
export function isAdvanceOnlyMessage(text: string): boolean {
  const parsed = parseAdvanceKeyword(text);
  if (!parsed) return false;
  if (parsed.command === "clear") return true;
  // 数字（金額）が残っていなければ、支出の新規登録ではなく直前の記録への適用とみなす。
  return !/\d/.test(parsed.rest);
}
