import { describe, it, expect } from "vitest";
import { computeBalances, simplifySettlement } from "@/lib/splitSettlement";

describe("computeBalances", () => {
  it("splits an expense equally among beneficiaries", () => {
    const participants = [
      { id: "a", name: "ハルキ" },
      { id: "b", name: "アリサ" },
      { id: "c", name: "友人" },
    ];
    const expenses = [{ id: "e1", payer_id: "a", amount: 3000 }];
    const shares = { e1: ["a", "b", "c"] };

    const balances = computeBalances(participants, expenses, shares);
    const byId = Object.fromEntries(balances.map((b) => [b.participantId, b]));

    expect(byId.a.paid).toBe(3000);
    expect(byId.a.owed).toBeCloseTo(1000);
    expect(byId.a.net).toBeCloseTo(2000);
    expect(byId.b.net).toBeCloseTo(-1000);
    expect(byId.c.net).toBeCloseTo(-1000);
  });

  it("supports a beneficiary subset smaller than all participants", () => {
    const participants = [
      { id: "a", name: "ハルキ" },
      { id: "b", name: "アリサ" },
      { id: "c", name: "友人" },
    ];
    const expenses = [{ id: "e1", payer_id: "b", amount: 2000 }];
    const shares = { e1: ["a", "c"] }; // アリサが立て替えたが、本人は受益者に入っていない

    const balances = computeBalances(participants, expenses, shares);
    const byId = Object.fromEntries(balances.map((b) => [b.participantId, b]));

    expect(byId.b.net).toBeCloseTo(2000); // 全額立て替えて、自分は使っていない
    expect(byId.a.net).toBeCloseTo(-1000);
    expect(byId.c.net).toBeCloseTo(-1000);
  });

  it("nets multiple expenses across participants", () => {
    const participants = [
      { id: "a", name: "ハルキ" },
      { id: "b", name: "アリサ" },
    ];
    const expenses = [
      { id: "e1", payer_id: "a", amount: 1000 },
      { id: "e2", payer_id: "b", amount: 1000 },
    ];
    const shares = { e1: ["a", "b"], e2: ["a", "b"] };

    const balances = computeBalances(participants, expenses, shares);
    for (const b of balances) expect(b.net).toBeCloseTo(0);
  });
});

describe("simplifySettlement", () => {
  it("produces no transactions when everyone is even", () => {
    const balances = [
      { participantId: "a", name: "ハルキ", paid: 1000, owed: 1000, net: 0 },
      { participantId: "b", name: "アリサ", paid: 1000, owed: 1000, net: 0 },
    ];
    expect(simplifySettlement(balances)).toEqual([]);
  });

  it("settles a simple two-person debt in one transaction", () => {
    const balances = [
      { participantId: "a", name: "ハルキ", paid: 3000, owed: 1000, net: 2000 },
      { participantId: "b", name: "アリサ", paid: 0, owed: 1000, net: -1000 },
      { participantId: "c", name: "友人", paid: 0, owed: 1000, net: -1000 },
    ];
    const txns = simplifySettlement(balances);
    expect(txns).toHaveLength(2);
    expect(txns.every((t) => t.to === "ハルキ")).toBe(true);
    expect(txns.reduce((s, t) => s + t.amount, 0)).toBe(2000);
  });

  it("minimizes transaction count versus a naive pairwise settlement", () => {
    // A owes 100, B is owed 100, C owes 50, D is owed 50 → 2 transactions, not 4
    const balances = [
      { participantId: "a", name: "A", paid: 0, owed: 100, net: -100 },
      { participantId: "b", name: "B", paid: 100, owed: 0, net: 100 },
      { participantId: "c", name: "C", paid: 0, owed: 50, net: -50 },
      { participantId: "d", name: "D", paid: 50, owed: 0, net: 50 },
    ];
    expect(simplifySettlement(balances)).toHaveLength(2);
  });
});
