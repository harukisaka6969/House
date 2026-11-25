/**
 * 立替の清算サイクル（純粋関数のみ・テストから直接読める）。
 *
 * アリサ・遥希が自分のカードで立て替えた支出（expenses.paid_by）を、エポスカードの請求サイクルに
 * 合わせて締め、確定した月ごとの金額を第2週に清算する。
 * エポスカード（口座引落し・27日払い）は「前月28日〜今月27日のご利用分を翌月27日に引落し」で、
 * 請求額は引落し月の6日に確定する（エポスカード公式FAQより）。
 *   例: 10/28〜11/27のご利用 → 12/6に確定 → 12/8〜12/14に清算 → 12/27に引落し
 * サイクルは締め日の属する月で呼ぶ（上の例は "2026-11"）。
 */
import { shiftMonth } from "./date";

/** エポスカードの締め日（27日払いコース）。 */
export const EPOS_CLOSING_DAY = 27;
/** 請求額が確定する日（引落し月の6日）。 */
export const EPOS_CONFIRM_DAY = 6;
/** 引落し日。 */
export const EPOS_PAYMENT_DAY = 27;
/** 清算する「第2週」（引落し月の8日〜14日）。 */
export const SETTLE_WEEK = { from: 8, to: 14 } as const;

const pad = (n: number) => String(n).padStart(2, "0");

export interface AdvanceCycle {
  /** 締め日の属する月（"YYYY-MM"）。 */
  key: string;
  /** 利用期間の初日（含む）。 */
  from: string;
  /** 利用期間の締め日（含む）。 */
  to: string;
  /** 請求額の確定日。 */
  confirmDate: string;
  /** 清算する週の初日・最終日。 */
  settleFrom: string;
  settleTo: string;
  /** 引落し日。 */
  paymentDate: string;
}

export function advanceCycle(key: string): AdvanceCycle {
  const prev = shiftMonth(key, -1);
  const next = shiftMonth(key, 1);
  return {
    key,
    from: `${prev}-${pad(EPOS_CLOSING_DAY + 1)}`,
    to: `${key}-${pad(EPOS_CLOSING_DAY)}`,
    confirmDate: `${next}-${pad(EPOS_CONFIRM_DAY)}`,
    settleFrom: `${next}-${pad(SETTLE_WEEK.from)}`,
    settleTo: `${next}-${pad(SETTLE_WEEK.to)}`,
    paymentDate: `${next}-${pad(EPOS_PAYMENT_DAY)}`,
  };
}

/** その日の利用がどのサイクルに入るか（28日以降は翌月締め）。 */
export function cycleKeyOfDate(date: string): string {
  const month = date.slice(0, 7);
  return Number(date.slice(8, 10)) > EPOS_CLOSING_DAY ? shiftMonth(month, 1) : month;
}

/** 金額が確定済みのサイクルのうち、いちばん新しいもの（今日が6日以降なら前月締め、5日までは前々月締め）。 */
export function latestConfirmedCycleKey(today: string): string {
  const month = today.slice(0, 7);
  return Number(today.slice(8, 10)) >= EPOS_CONFIRM_DAY ? shiftMonth(month, -1) : shiftMonth(month, -2);
}

export interface AdvanceRow {
  date: string;
  amount: number;
  paid_by: string | null;
  account_id: string;
  /** 誰の支出か（nullは2人の共通の支出）。 */
  owner?: string | null;
}

export interface AdvanceTotals {
  /** 立て替えた人ごとの合計と、どの口座の分を立て替えたかの内訳。 */
  byPerson: { profileId: string; total: number; count: number; byAccount: Record<string, number> }[];
  total: number;
}

/** サイクルの利用期間に入る立替を、立て替えた人ごとに集計する。people の順で並べ、立替が無い人も0円で含める。 */
export function summarizeAdvances(rows: AdvanceRow[], cycle: AdvanceCycle, people: string[]): AdvanceTotals {
  const inCycle = rows.filter((r) => r.paid_by && r.date >= cycle.from && r.date <= cycle.to);
  const byPerson = people.map((profileId) => {
    const mine = inCycle.filter((r) => r.paid_by === profileId);
    const byAccount: Record<string, number> = {};
    for (const r of mine) byAccount[r.account_id] = (byAccount[r.account_id] ?? 0) + (Number(r.amount) || 0);
    return { profileId, total: mine.reduce((s, r) => s + (Number(r.amount) || 0), 0), count: mine.length, byAccount };
  });
  return { byPerson, total: byPerson.reduce((s, p) => s + p.total, 0) };
}

export interface SettlementTransfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * 2人の間で、誰から誰にいくら払えば立替が精算されるか（相殺後の1本にまとめる）。
 * 口座や「誰の支出か」は見ず、それぞれが立て替えた合計どうしの差額を、少ない方から多い方へ払う。
 * 差し引き0円ならnull。people は2人（遥希とアリサ）のprofile id。
 */
export function settlementTransfer(rows: AdvanceRow[], cycle: AdvanceCycle, people: [string, string]): SettlementTransfer | null {
  const [a, b] = people;
  const totals = summarizeAdvances(rows, cycle, [a, b]).byPerson;
  const diff = Math.round(totals[0].total - totals[1].total);
  if (diff === 0) return null;
  return diff > 0 ? { from: b, to: a, amount: diff } : { from: a, to: b, amount: -diff };
}
