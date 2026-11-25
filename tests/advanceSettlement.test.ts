import { describe, it, expect } from "vitest";
import { advanceCycle, cycleKeyOfDate, latestConfirmedCycleKey, summarizeAdvances, settlementTransfer } from "@/lib/advanceSettlement";

describe("advanceCycle（エポス27日払い）", () => {
  it("前月28日〜今月27日の利用を、翌月6日に確定・8〜14日に清算・27日に引落しとする", () => {
    expect(advanceCycle("2026-11")).toEqual({
      key: "2026-11",
      from: "2026-10-28",
      to: "2026-11-27",
      confirmDate: "2026-12-06",
      settleFrom: "2026-12-08",
      settleTo: "2026-12-14",
      paymentDate: "2026-12-27",
    });
  });

  it("年をまたぐサイクルも正しく扱う", () => {
    const c = advanceCycle("2027-01");
    expect(c.from).toBe("2026-12-28");
    expect(c.to).toBe("2027-01-27");
    expect(c.paymentDate).toBe("2027-02-27");
  });
});

describe("cycleKeyOfDate", () => {
  it("27日までは当月締め、28日以降は翌月締め", () => {
    expect(cycleKeyOfDate("2026-11-27")).toBe("2026-11");
    expect(cycleKeyOfDate("2026-11-28")).toBe("2026-12");
    expect(cycleKeyOfDate("2026-12-31")).toBe("2027-01");
  });
});

describe("latestConfirmedCycleKey", () => {
  it("6日以降は前月締めのサイクルが確定済み", () => {
    expect(latestConfirmedCycleKey("2026-12-06")).toBe("2026-11");
    expect(latestConfirmedCycleKey("2026-11-19")).toBe("2026-10");
  });

  it("5日まではまだ前月締め分が確定していないので、前々月締めが最新", () => {
    expect(latestConfirmedCycleKey("2026-12-05")).toBe("2026-10");
  });
});

describe("summarizeAdvances", () => {
  const cycle = advanceCycle("2026-11");
  const rows = [
    { date: "2026-10-28", amount: 1000, paid_by: "arisa", account_id: "a3" },
    { date: "2026-11-27", amount: 2000, paid_by: "arisa", account_id: "a1" },
    { date: "2026-11-10", amount: 500, paid_by: "haruki", account_id: "a3" },
    { date: "2026-10-27", amount: 9999, paid_by: "arisa", account_id: "a3" }, // 前のサイクル
    { date: "2026-11-28", amount: 9999, paid_by: "haruki", account_id: "a3" }, // 次のサイクル
    { date: "2026-11-15", amount: 9999, paid_by: null, account_id: "a1" }, // 立替ではない
  ];

  it("サイクル内の立替だけを、人ごと・口座ごとに集計する", () => {
    const s = summarizeAdvances(rows, cycle, ["haruki", "arisa"]);
    expect(s.total).toBe(3500);
    expect(s.byPerson).toEqual([
      { profileId: "haruki", total: 500, count: 1, byAccount: { a3: 500 } },
      { profileId: "arisa", total: 3000, count: 2, byAccount: { a3: 1000, a1: 2000 } },
    ]);
  });

  it("立替が無い人も0円で含める", () => {
    expect(summarizeAdvances([], cycle, ["haruki"]).byPerson).toEqual([{ profileId: "haruki", total: 0, count: 0, byAccount: {} }]);
  });
});

describe("settlementTransfer（誰から誰にいくら）", () => {
  const cycle = advanceCycle("2026-11");
  const people: [string, string] = ["haruki", "arisa"];

  it("共通の支出は半分、相手の支出は全額、自分の支出は0として相殺する", () => {
    const rows = [
      { date: "2026-11-01", amount: 10000, paid_by: "arisa", account_id: "a1", owner: null }, // 遥希が5000負担
      { date: "2026-11-02", amount: 3000, paid_by: "arisa", account_id: "a3", owner: "haruki" }, // 遥希が3000負担
      { date: "2026-11-03", amount: 9999, paid_by: "arisa", account_id: "a3", owner: "arisa" }, // 清算なし
      { date: "2026-11-04", amount: 4000, paid_by: "haruki", account_id: "a1", owner: null }, // アリサが2000負担
    ];
    expect(settlementTransfer(rows, cycle, people)).toEqual({ from: "haruki", to: "arisa", amount: 6000 });
  });

  it("逆向きも出る・期間外は数えない", () => {
    const rows = [
      { date: "2026-11-10", amount: 8000, paid_by: "haruki", account_id: "a1", owner: "arisa" },
      { date: "2026-11-28", amount: 99999, paid_by: "arisa", account_id: "a1", owner: null },
    ];
    expect(settlementTransfer(rows, cycle, people)).toEqual({ from: "arisa", to: "haruki", amount: 8000 });
  });

  it("差し引き0円ならnull", () => {
    const rows = [
      { date: "2026-11-10", amount: 2000, paid_by: "haruki", account_id: "a1", owner: null },
      { date: "2026-11-11", amount: 2000, paid_by: "arisa", account_id: "a1", owner: null },
    ];
    expect(settlementTransfer(rows, cycle, people)).toBeNull();
    expect(settlementTransfer([], cycle, people)).toBeNull();
  });
});
