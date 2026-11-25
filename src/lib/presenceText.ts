/**
 * LINEで「ただいま」「いってきます」と送って、在宅・外出の記録を手で直すための判定（純粋関数・テストから直接読める）。
 * iPhoneの位置情報オートメーションは、電池切れや通信不良で帰宅・出発の記録が抜けることがあるため、その安全策。
 */

export type PresenceCommand = "home" | "leave";

const HOME_WORDS = ["ただいま", "帰宅", "帰宅した", "家にいる", "在宅"];
const LEAVE_WORDS = ["いってきます", "行ってきます", "外出", "外出した", "出発"];

/** 文章全体がこれらの語（＋句読点・絵文字程度）だけなら、在宅/外出の指示として読む。 */
export function parsePresenceCommand(text: string): PresenceCommand | null {
  const t = (text ?? "").normalize("NFKC").trim().replace(/[。、！!？?\s〜ー~]+$/u, "").replace(/\p{Extended_Pictographic}/gu, "").trim();
  if (HOME_WORDS.includes(t)) return "home";
  if (LEAVE_WORDS.includes(t)) return "leave";
  return null;
}
