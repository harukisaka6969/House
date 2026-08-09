export interface SplitParticipantLike {
  id: string;
  name: string;
}

export interface SplitExpenseLike {
  id: string;
  payer_id: string;
  amount: number;
}

export interface SplitBalance {
  participantId: string;
  name: string;
  paid: number;
  owed: number;
  net: number;
}

export interface SplitSettlementTxn {
  from: string;
  to: string;
  amount: number;
}

/** 各参加者の支払額・受益額・差額（プラス=受け取るべき、マイナス=支払うべき）を計算する。 */
export function computeBalances(
  participants: SplitParticipantLike[],
  expenses: SplitExpenseLike[],
  sharesByExpense: Record<string, string[]>
): SplitBalance[] {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();
  for (const p of participants) {
    paid.set(p.id, 0);
    owed.set(p.id, 0);
  }
  for (const e of expenses) {
    paid.set(e.payer_id, (paid.get(e.payer_id) ?? 0) + Number(e.amount));
    const beneficiaries = sharesByExpense[e.id] ?? [];
    if (beneficiaries.length === 0) continue;
    const share = Number(e.amount) / beneficiaries.length;
    for (const pid of beneficiaries) owed.set(pid, (owed.get(pid) ?? 0) + share);
  }
  return participants.map((p) => {
    const p_paid = paid.get(p.id) ?? 0;
    const p_owed = owed.get(p.id) ?? 0;
    return { participantId: p.id, name: p.name, paid: p_paid, owed: p_owed, net: p_paid - p_owed };
  });
}

/** 差額を、最少の送金回数で解消する組み合わせに単純化する（貪欲法）。 */
export function simplifySettlement(balances: SplitBalance[]): SplitSettlementTxn[] {
  const EPS = 0.5; // 円未満の丸め誤差は無視
  const creditors = balances
    .filter((b) => b.net > EPS)
    .map((b) => ({ name: b.name, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = balances
    .filter((b) => b.net < -EPS)
    .map((b) => ({ name: b.name, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);

  const txns: SplitSettlementTxn[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > EPS) txns.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(amount) });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount <= EPS) i += 1;
    if (creditors[j].amount <= EPS) j += 1;
  }
  return txns;
}
