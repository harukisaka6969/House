export const PATTERN_MIN_NODES = 4;
export const PATTERN_MAX_NODES = 9;

/** Android風9点パターンの1点あたりの番号は1〜9（3x3グリッドを左上から右下へ）。 */
export function isValidPatternSequence(nodes: number[]): boolean {
  if (nodes.length < PATTERN_MIN_NODES || nodes.length > PATTERN_MAX_NODES) return false;
  if (!nodes.every((n) => Number.isInteger(n) && n >= 1 && n <= 9)) return false;
  return new Set(nodes).size === nodes.length;
}

/** パターンを既存のPINハッシュ機構（scrypt、任意の文字列を受け付ける）にそのまま渡せる
 * 数字文字列に変換する。無効なパターンはエラーを投げる（呼び出し側で事前検証すること）。 */
export function patternToCode(nodes: number[]): string {
  if (!isValidPatternSequence(nodes)) {
    throw new Error("invalid pattern sequence");
  }
  return nodes.join("");
}

/** 各点が1桁（1〜9）なので、コード文字列は1文字=1点として可逆的に配列へ戻せる。
 * APIで「PINでもパターンでも同じ1つの文字列フィールド」として運べるようにするための検証関数。 */
export function isValidPatternCode(code: string): boolean {
  if (!/^[1-9]+$/.test(code)) return false;
  return isValidPatternSequence(code.split("").map(Number));
}
