/**
 * LINEで送られてきた文章から「立替」「取り消し」の指示を読み取る部分（純粋関数のみ・テストから直接読める）。
 *
 * 第1口座・第3口座から払うべきものを自分のカードで立て替える、というケースが多いため、
 * ・支出の文章に「立替」を混ぜて送る（例: 「コスメ 3800円 立替」）
 * ・写真を送った直後に「立替」だけ送る（直前の記録に後から適用する）
 * の両方を同じ書き方で扱えるようにする。
 *
 * 表記ゆれは広めに許容する（漢字・ひらがな・カタカナ・送り仮名の違い、「建て替え」のような
 * 変換ミス、「立て変え」のような誤字まで拾う）。スマホでの入力ミスで機能が動かないほうが困るため。
 */

export type AdvanceCommand = "set" | "clear";

/** 全角・半角をそろえ、カタカナをひらがなに寄せて比較しやすくする。 */
function normalize(text: string): string {
  return (text ?? "")
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase()
    .trim();
}

/** 「立替」の表記ゆれ。「立/建/たて」＋（て）＋「替/変/換/かえ」の組み合わせを拾う。
 * 例: 立替 / 立て替え / 立替え / 建て替え / 建替 / たてかえ / タテカエ / 立て変え / 立て換え */
const ADVANCE_RE = /(立|建|たて)\s*(て)?\s*(替|変|換|かえ)(え|かえ)?/;

/** 「取り消し」の表記ゆれ。取消 / 取り消し / とりけし / トリケシ / キャンセル / 削除 / 消して など。 */
const CANCEL_RE = /(取\s*り?\s*消(し|して)?|とりけし|きゃんせる|cancel|削除|消して|消去|なかったこと|やっぱ(り)?(なし|やめ))/;

/** 立替の「解除」を表す語（立替の語と一緒に使われた場合）。 */
const CLEAR_RE = /(取\s*り?\s*消(し|して)?|とりけし|きゃんせる|解除|やめる|なし|off|削除)/;

export interface AdvanceKeyword {
  /** set=立替として記録、clear=立替を解除。 */
  command: AdvanceCommand;
  /** 「立替」の語を取り除いた残りの文章（支出の解析にはこちらを使う）。 */
  rest: string;
}

/** 文章に「立替」の指示が含まれていれば、その種類と、語を除いた残りの文章を返す。無ければnull。 */
export function parseAdvanceKeyword(text: string): AdvanceKeyword | null {
  const raw = (text ?? "").trim();
  if (raw === "") return null;
  const normalized = normalize(raw);
  const match = normalized.match(ADVANCE_RE);
  if (!match) return null;

  // 元の文章から語を取り除く。正規化で位置がずれる場合もあるため、正規化後の文章から作る。
  const rest = normalized.replace(ADVANCE_RE, " ").replace(/\s+/g, " ").trim();
  const isClear = CLEAR_RE.test(rest);
  if (isClear) return { command: "clear", rest: "" };

  // 「立替」の語以外に内容が残っている場合は、元の文章から語だけを抜いたものを返す
  // （AIに渡すので、正規化で崩れていない元の表記のほうが望ましい）。
  const restFromRaw = raw.replace(new RegExp(match[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ").replace(/\s+/g, " ").trim();
  return { command: "set", rest: restFromRaw !== raw ? restFromRaw : rest };
}

/** 「立替」の指示だけで、支出の内容（金額など）が含まれていないメッセージか。
 * trueなら「直前に登録した支出に後から適用する」操作として扱う。 */
export function isAdvanceOnlyMessage(text: string): boolean {
  const parsed = parseAdvanceKeyword(text);
  if (!parsed) return false;
  if (parsed.command === "clear") return true;
  // 数字（金額）が残っていなければ、支出の新規登録ではなく直前の記録への適用とみなす。
  // 全角数字（３８００円）は \d に一致しないため、正規化してから判定する。
  return !/\d/.test(normalize(parsed.rest));
}

/** 「取り消し」系のメッセージか（直前にLINEから登録した記録を消す指示）。
 * 「立替」の語を含む場合は立替の解除なので、こちらでは扱わない。 */
export function isCancelMessage(text: string): boolean {
  const raw = (text ?? "").trim();
  if (raw === "") return false;
  const normalized = normalize(raw);
  if (ADVANCE_RE.test(normalized)) return false;
  if (!CANCEL_RE.test(normalized)) return false;
  // 「〇〇を取り消して」程度の短い指示だけを対象にする（長文に偶然含まれた場合は無視）。
  return normalized.length <= 20;
}
