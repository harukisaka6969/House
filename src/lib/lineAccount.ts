/**
 * LINEで登録した支出の「口座を変更」ボタンまわり（純粋関数のみ・テストから直接読める）。
 *
 * 支出の口座はAIが自動判定するが、間違っていることもあるため、登録の返信に
 * 「第3口座に変更」のようなワンタップのボタンを添えて、その場で付け替えられるようにする。
 */
import { A1_ONLY_CATEGORIES, A3_ONLY_CATEGORIES } from "./constants";

export const ACCOUNT_POSTBACK_PREFIX = "acct:";

/** 「第1口座（生活費）」→「第1口座」。ボタンのラベル（20文字まで）に収めるため括弧書きを落とす。 */
export function shortAccountName(name: string): string {
  return name.replace(/（.*?）|\(.*?\)/g, "").trim() || name;
}

/** 返信に添える口座変更ボタン。全件が同じ口座ならその口座は候補から外す。 */
export function accountChangeButtons(
  ids: string[],
  currentAccountIds: string[],
  accounts: { id: string; name: string }[]
): { label: string; data: string; displayText: string }[] {
  if (ids.length === 0) return [];
  const current = new Set(currentAccountIds);
  const sameForAll = current.size === 1 ? [...current][0] : null;
  return accounts
    .filter((a) => a.id !== sameForAll)
    .map((a) => {
      const short = shortAccountName(a.name);
      return {
        label: `${short}に変更`.slice(0, 20),
        data: `${ACCOUNT_POSTBACK_PREFIX}${a.id}:${ids.join(",")}`,
        displayText: `口座を${short}に変更`,
      };
    });
}

/** postbackのdata（"acct:<口座id>:<支出id,...>"）を読む。形式が違えばnull。 */
export function parseAccountPostback(data: string): { accountId: string; ids: string[] } | null {
  if (!data.startsWith(ACCOUNT_POSTBACK_PREFIX)) return null;
  const rest = data.slice(ACCOUNT_POSTBACK_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const accountId = rest.slice(0, sep);
  const ids = rest.slice(sep + 1).split(",").filter(Boolean);
  return ids.length > 0 ? { accountId, ids } : null;
}

/** 口座を付け替えたとき、その口座では選べないカテゴリ（第1口座の「趣味」、第3口座の「食費」など）を
 * 近いものに直す。食費→外食のように対応が自然なものは置き換え、それ以外は「その他」にする。
 * そのまま使えるなら元のカテゴリを返す。 */
export function categoryForAccount(category: string, accountId: string): string {
  if (accountId === "a1" && (A3_ONLY_CATEGORIES as readonly string[]).includes(category)) return "その他";
  if (accountId === "a3" && (A1_ONLY_CATEGORIES as readonly string[]).includes(category)) {
    return category === "食費" ? "外食" : "その他";
  }
  return category;
}
