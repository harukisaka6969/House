/**
 * 生活tips（LINEに1日数回送る記事）の本文抽出・検品（純粋関数・テストから直接読める）。
 *
 * AIにはweb検索などを使わせているため、本文の前後に「検索結果が集まりました」のような
 * 独り言が混ざることがある。そのため本文は<output>タグで囲ませて抽出し、さらに
 * 「抽出できたものが本当に記事になっているか」をここで検品する。
 * 検品に落ちたものは送らず記録もしないことで、同じ日のうちに再生成される（追いつき配信）。
 */

export function extractTag(text: string, tag: string): string {
  const match = (text ?? "").match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return (match ? match[1] : "").trim();
}

/** <output>本文を取り出す。万一トークン上限で応答が</output>閉じタグの手前で切れてしまった場合でも、
 * 生の<output>タグをそのままLINEに表示してしまわないよう、開始タグの直後から末尾までを使う。 */
export function extractOutputContent(raw: string): string {
  const closed = extractTag(raw, "output");
  if (closed) return closed;
  const text = (raw ?? "").trim();
  const openIdx = text.indexOf("<output>");
  if (openIdx !== -1) return text.slice(openIdx + "<output>".length).trim();
  return text;
}

/** 記事として送れる中身かどうか。
 * ・短すぎるもの（生成が途中で止まった、タグだけ返ってきた等）
 * ・タグが残っているもの（抽出に失敗している）
 * ・日本語がほとんど無いもの（"Now I have enough material to write the digest." のような
 *   検索中の独り言がそのまま返ってきたケース。実際にこれがLINEに送られていた）
 * を弾く。 */
export function isUsableTipContent(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 30) return false;
  if (/<\/?(?:output|summary)>/.test(t)) return false;
  const japanese = (t.match(/[ぁ-んァ-ヶ一-龥]/g) ?? []).length;
  return japanese >= t.length * 0.2;
}
