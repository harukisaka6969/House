/**
 * LINEの「買い物リスト」系メッセージの解析（純粋関数・テストから直接読める）。
 *
 * ・「買い物リスト」だけ → 西友のリストをふたりに送信し、送った分は購入済みにする（従来動作）
 * ・「買い物リスト確認」 → 今のリストを見るだけ（購入済みにしない）
 * ・「醤油 買い物リスト」→ 「買い物リスト」の前にある商品を西友のリストに追加
 * ・「Amazon 醤油 https://…」→ Amazonのリストに追加（リンクは任意）
 */

import { containsMoneyAmount } from "./moneyText";

export type ShoppingListCommand =
  | { kind: "send" }
  | { kind: "show" }
  | { kind: "add"; store: "seiyu" | "amazon"; items: ShoppingListItem[] };

export interface ShoppingListItem {
  name: string;
  /** 商品リンク。http(s)が無い書き方（○○.com）でも補って返す。無ければnull。 */
  url: string | null;
}

function normalize(text: string): string {
  return (text ?? "").normalize("NFKC").trim();
}

/** 「買い物リスト」「買物リスト」「お買い物リスト」のゆれ。 */
const LIST_WORD = "(?:お)?買(?:い)?物リスト";
/** 末尾の「に追加」「へ追加」「追加」を取り除くための語。 */
const ADD_SUFFIX = "(?:\\s*(?:に|へ)?\\s*追加)?";

const SEND_RE = new RegExp(`^${LIST_WORD}$`);
const SHOW_RE = new RegExp(
  `^(?:${LIST_WORD}\\s*(?:を|は)?\\s*(?:確認|チェック|見せて|教えて|見たい)|(?:確認|チェック)\\s*${LIST_WORD}|${LIST_WORD}\\s*(?:は|って)?\\s*[?？])[?？]?$`
);
const ADD_RE = new RegExp(`^(.+?)\\s*${LIST_WORD}${ADD_SUFFIX}$`);
const AMAZON_RE = /^(?:amazon|アマゾン)\s*[:：]?\s*(.+)$/i;

/** http(s)付きのURL。 */
const FULL_URL_RE = /https?:\/\/[^\s、,，]+/i;
/** 「○○.com」「amzn.asia/d/xxx」のようにスキームが無い書き方。 */
const BARE_URL_RE = /(?:[a-z0-9぀-ヿ一-鿿-]+\.)+(?:com|co\.jp|jp|net|org|io|shop|store|asia|me|to)(?:\/[^\s、,，]*)?/i;

/** 文章からリンクを取り出し、リンクを除いた残りの文字列と一緒に返す。 */
export function extractUrl(text: string): { url: string | null; rest: string } {
  const t = normalize(text);
  const full = FULL_URL_RE.exec(t);
  if (full) return { url: full[0], rest: t.replace(full[0], " ").replace(/\s+/g, " ").trim() };
  const bare = BARE_URL_RE.exec(t);
  if (bare) return { url: `https://${bare[0]}`, rest: t.replace(bare[0], " ").replace(/\s+/g, " ").trim() };
  return { url: null, rest: t };
}

/** 「醤油、味噌」「醤油/味噌」のように複数書かれていれば分ける（「と」では分けない: 「ところてん」等を壊すため）。 */
function splitNames(text: string): string[] {
  return text
    .split(/[、,，/／・\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 「買い物リスト」系のメッセージを解析する。該当しなければnull（他の処理に回す）。
 */
export function parseShoppingListMessage(text: string): ShoppingListCommand | null {
  const t = normalize(text);
  if (!t) return null;

  if (SHOW_RE.test(t)) return { kind: "show" };
  if (SEND_RE.test(t)) return { kind: "send" };

  // 「Amazon 醤油 https://…」。Amazon指定のほうを先に見るので「Amazon醤油買い物リスト」もAmazon側に入る。
  const amazon = AMAZON_RE.exec(t);
  if (amazon) {
    const body = amazon[1].replace(new RegExp(`\\s*${LIST_WORD}${ADD_SUFFIX}$`), "").trim();
    // 「買い物リスト」と明示されていない場合は、「Amazonで本を1200円買った」のような支出の報告と
    // 区別する必要があるので、金額を含む文章や長い文章はリスト追加とみなさない。
    const explicit = body !== amazon[1].trim();
    if (!explicit && (containsMoneyAmount(t) || t.length > 60)) return null;
    const { url, rest } = extractUrl(body);
    const names = splitNames(rest);
    const items: ShoppingListItem[] =
      names.length > 0 ? names.map((name, i) => ({ name, url: i === 0 ? url : null })) : url ? [{ name: "Amazonの商品", url }] : [];
    return items.length > 0 ? { kind: "add", store: "amazon", items } : null;
  }

  // 「醤油 買い物リスト」: 「買い物リスト」の前に書かれている商品を西友のリストへ。
  const add = ADD_RE.exec(t);
  if (add) {
    const { url, rest } = extractUrl(add[1]);
    const names = splitNames(rest);
    if (names.length === 0) return null;
    return { kind: "add", store: "seiyu", items: names.map((name, i) => ({ name, url: i === 0 ? url : null })) };
  }

  return null;
}
