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

  it("Apple Payのデバイスアカウント番号（QUICPay・iD含む）も本体と同じ呼び名にする", () => {
    expect(resolvePaymentMethod({ cardLast4: "9088" })).toBe("共用カード");
    expect(resolvePaymentMethod({ cardLast4: "5708" })).toBe("遥希MUFG");
    expect(resolvePaymentMethod({ cardLast4: "3746" })).toBe("遥希AU");
    expect(resolvePaymentMethod({ cardLast4: "3034", rawText: "QUICPay" })).toBe("遥希AU");
    expect(resolvePaymentMethod({ cardLast4: "9170" })).toBe("遥希SMBC");
    expect(resolvePaymentMethod({ cardLast4: "6489", rawText: "iD" })).toBe("遥希SMBC");
    expect(resolvePaymentMethod({ cardLast4: "9891" })).toBe("遥希PayPayカード");
    expect(resolvePaymentMethod({ cardLast4: "9354", rawText: "QUICPay" })).toBe("遥希PayPayカード");
    expect(resolvePaymentMethod({ cardLast4: "5626" })).toBe("遥希PayPayカード");
    // アリサのiPhoneのApple Pay（同じカードでも端末ごとに番号が違う）
    expect(resolvePaymentMethod({ cardLast4: "1836" })).toBe("共用カード");
    expect(resolvePaymentMethod({ cardLast4: "9805", rawText: "iD" })).toBe("遥希SMBC");
    expect(resolvePaymentMethod({ cardLast4: "3278" })).toBe("遥希SMBC");
    expect(resolvePaymentMethod({ cardLast4: "6786", rawText: "QUICPay" })).toBe("アリサEPOS");
    expect(resolvePaymentMethod({ cardLast4: "6118" })).toBe("アリサEPOS");
  });

  it("PayPayカードとQRコード決済のPayPayを区別する", () => {
    expect(resolvePaymentMethod({ rawText: "PayPayカード" })).toBe("遥希PayPayカード");
    expect(resolvePaymentMethod({ rawText: "PayPayで支払い" })).toBe("PayPay");
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
    expect(resolvePaymentMethod({ rawText: "コンビニで5708円" })).toBeNull();
    expect(resolvePaymentMethod({ rawText: "合計 ¥9088" })).toBeNull();
    expect(resolvePaymentMethod({ rawText: "ディナー 3,034円" })).toBeNull();
  });

  it("全角の表記でも判定できる", () => {
    expect(resolvePaymentMethod({ rawText: "ＰａｙＰａｙ払い" })).toBe("PayPay");
    expect(resolvePaymentMethod({ rawText: "末尾６７２５" })).toBe("共用カード");
  });
});
