/**
 * 「3人で夜ご飯を食べて50,000円だった。2人分。」のような文章から、割り勘の比率を読み取る
 * （純粋関数・テストから直接読める）。
 *
 * den = その場にいた合計人数（「3人で」）、num = 自分たちが負担する人数分（「2人分」）。
 * num=2 なら遥希とアリサの2人分、num=1 ならどちらか1人だけが参加していた状況を表す。
 * 支出側では amount を「全額 × num / den」に置き換え、全額は split_total_amount に残す。
 */

export interface SplitHint {
  /** 自分たちが負担する人数（分子）。 */
  num: number;
  /** その場にいた合計人数（分母）。 */
  den: number;
}

const KANJI_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 「三」「十」「十二」「二十三」程度の漢数字を数値にする。人数なのでこの範囲で十分。 */
function kanjiToNumber(s: string): number | null {
  if (/^[一二三四五六七八九]$/.test(s)) return KANJI_DIGITS[s];
  const m = /^([一二三四五六七八九])?十([一二三四五六七八九])?$/.exec(s);
  if (m) return (m[1] ? KANJI_DIGITS[m[1]] : 1) * 10 + (m[2] ? KANJI_DIGITS[m[2]] : 0);
  return null;
}

/** 全角数字をそろえ、人数に使われる漢数字・ひらがな表記を半角数字に直す。 */
function normalize(text: string): string {
  let t = (text ?? "").normalize("NFKC");
  t = t.replace(/ひとり/g, "1人").replace(/ふたり/g, "2人").replace(/さんにん/g, "3人");
  // 「三人」「二十人」のように人・名の直前にある漢数字だけを数値化する（金額の漢数字は触らない）。
  t = t.replace(/[一二三四五六七八九十]+(?=\s*[人名])/g, (m) => {
    const n = kanjiToNumber(m);
    return n === null ? m : String(n);
  });
  return t;
}

/** 「2人分」「2名分」のような自分たちの負担人数。 */
const NUM_RE = /(\d+)\s*[人名]\s*分/;
/** 「3人で」のような合計人数（「〇人分」を取り除いた残りから探す）。 */
const DEN_RE = /(\d+)\s*[人名]/;
/** 人数として現実的な上限。金額の誤検出を避けるための安全弁。 */
const MAX_PEOPLE = 50;

/**
 * 割り勘の比率を読み取る。合計人数と負担人数の両方が分かるときだけ返す。
 * 「3人で…2人分」→ {num:2, den:3}。全員分（num===den）や読み取れない場合はnull。
 */
export function parseSplitHint(text: string): SplitHint | null {
  const t = normalize(text);

  const numMatch = NUM_RE.exec(t);
  if (!numMatch) return null;
  const num = Number(numMatch[1]);

  // 「2人分」の部分を消してから合計人数を探す（「2人分」自体を合計人数と誤読しないため）。
  const rest = t.replace(new RegExp(NUM_RE.source, "g"), " ");
  const denMatch = DEN_RE.exec(rest);
  if (!denMatch) return null;
  const den = Number(denMatch[1]);

  if (!Number.isInteger(num) || !Number.isInteger(den)) return null;
  if (num < 1 || den < 2 || den > MAX_PEOPLE) return null;
  // 全員分を自分たちが払うなら割り勘ではない（金額をそのまま使う）。
  if (num >= den) return null;
  return { num, den };
}

/**
 * 「3人で2人分」だけが送られてきたか（金額を含まない、割り勘の指示のみのメッセージか）。
 * レシートの写真を送った直後に人数を伝えて、直前の支出に後から割り勘を適用するために使う。
 */
export function isSplitOnlyMessage(text: string): boolean {
  const t = normalize(text).trim();
  if (t.length === 0 || t.length > 24) return false;
  if (/[円¥]/.test(t)) return false;
  return parseSplitHint(t) !== null;
}

/** カタカナをひらがなに寄せて、表記の違い（アリサ／ありさ）を吸収する。 */
function foldKana(s: string): string {
  return s.normalize("NFKC").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * 「1人分」のとき、文中に名前が出ている人を参加者として推定する。
 * 「アリサと2人で食事、1人分」のように相手の名前しか出ていない場合に、その人の支出として記録するため。
 * 見つからなければnull（呼び出し側で送信者本人とみなす）。
 */
export function findMentionedPersonId(text: string, people: { id: string; name: string }[]): string | null {
  const t = foldKana(text);
  for (const p of people) {
    const name = foldKana(p.name).trim();
    if (name && t.includes(name)) return p.id;
  }
  return null;
}
