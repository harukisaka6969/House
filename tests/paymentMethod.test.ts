import { describe, it, expect } from "vitest";
import { resolvePaymentMethod } from "@/lib/paymentMethod";

describe("resolvePaymentMethod", () => {
  it("既知のカード下4桁を家庭内の呼び名に変換する", () => {
    expect(resolvePaymentMethod({ cardLast4: "6725" })).toBe("共用カード");
    expect(resolvePaymentMethod({ cardLast4: "6925" })).toBe("共用カード");
    expect(resolvePaymentMethod({ cardLast4: "0926" })).toBe("アリサEPOS");
    expect(resolvePaymentMethod({ cardLast4: "1089" })).toBe("遥希MUFG");
    expect(resolvePaymentMethod({ cardLast4: "2015" })).toBe("遥希SMBC");
    expect(resolvePaymentMethod({ cardLast4: "1052" })).toBe("遥希AU");
  });

  it("レシートによくあるマスク表記からも下4桁を拾う", () => {
    expect(resolvePaymentMethod({ rawText: "VISA ************6725" })).toBe("共用カード");
    expect(resolvePaymentMethod({ rawText: "4679 61XX XXXX 1089 CTL" })).toBe("遥希MUFG");
    expect(resolvePaymentMethod({ rawText: "カード番号 末尾2015" })).toBe("遥希SMBC");
    expect(resolvePaymentMethod({ rawText: "****-****-****-1052" })).toBe("遥希AU");
  });

  it("決済サービス名を正式な呼び名に揃える", () => {
    expect(resolvePaymentMethod({ rawText: "PayPayで支払い" })).toBe("PayPay");
    expect(resolvePaymentMethod({ rawText: "ペイペイ 1200円" })).toBe("PayPay");
    expect(resolvePaymentMethod({ rawText: "楽天ペイ利用" })).toBe("楽天ペイ");
    expect(resolvePaymentMethod({ rawText: "Suicaで改札" })).toBe("交通系IC");
    expect(resolvePaymentMethod({ rawText: "現金でお支払い" })).toBe("現金");
  });

  it("カード下4桁はサービス名より優先する（PayPay経由のカード決済などを取り違えないため）", () => {
    expect(resolvePaymentMethod({ cardLast4: "0926", rawText: "PayPay" })).toBe("アリサEPOS");
  });

  it("未知のカードは下4桁つきで残す（後から手で直せるように）", () => {
    expect(resolvePaymentMethod({ cardLast4: "1234" })).toBe("カード(末尾1234)");
  });

  it("手掛かりが無ければnull（無理に埋めない）", () => {
    expect(resolvePaymentMethod({})).toBeNull();
    expect(resolvePaymentMethod({ rawText: "セブンイレブンで480円" })).toBeNull();
  });

  it("金額の数字を下4桁と誤認しない", () => {
    expect(resolvePaymentMethod({ rawText: "合計 16725円" })).toBeNull();
    expect(resolvePaymentMethod({ rawText: "支払 20150円" })).toBeNull();
  });

  it("全角の表記でも判定できる", () => {
    expect(resolvePaymentMethod({ rawText: "ＰａｙＰａｙ払い" })).toBe("PayPay");
    expect(resolvePaymentMethod({ rawText: "末尾６７２５" })).toBe("共用カード");
  });
});
