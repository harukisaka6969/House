import { describe, it, expect } from "vitest";
import { othersAway, planDeparture, planArrival, sunsetUtc, isNearSunset, motionDetected, type DeviceCandidate } from "@/lib/awayShutoff";

const NOW = new Date("2026-11-25T10:00:00Z");
const PEOPLE = ["haruki", "arisa"];
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3600 * 1000).toISOString();

describe("othersAway（出発時: これで家に誰もいなくなったか）", () => {
  it("① アリサが家にいて遥希が出発 → 実行しない", () => {
    expect(othersAway("haruki", PEOPLE, [{ profile_slug: "arisa", left_at: null }], NOW)).toBe(false);
  });

  it("② 遥希が家にいてアリサが出発 → 実行しない", () => {
    expect(othersAway("arisa", PEOPLE, [{ profile_slug: "haruki", left_at: null }], NOW)).toBe(false);
  });

  it("③ 2人で出発（2人目の出発時点で相手は外出中）→ 実行", () => {
    expect(othersAway("arisa", PEOPLE, [{ profile_slug: "haruki", left_at: ago(0.01) }], NOW)).toBe(true);
  });

  it("④⑤ 片方が外にいて、もう片方が出発 → 実行", () => {
    expect(othersAway("haruki", PEOPLE, [{ profile_slug: "arisa", left_at: ago(30) }], NOW)).toBe(true);
    expect(othersAway("arisa", PEOPLE, [{ profile_slug: "haruki", left_at: ago(50) }], NOW)).toBe(true);
  });

  it("電池切れなどで帰宅の記録が抜けた古い外出記録は、外出中とみなさない", () => {
    expect(othersAway("haruki", PEOPLE, [{ profile_slug: "arisa", left_at: ago(24 * 22) }], NOW)).toBe(false);
  });

  it("判定対象でない人・記録の無い相手は実行しない側", () => {
    expect(othersAway("guest", PEOPLE, [], NOW)).toBe(false);
    expect(othersAway("haruki", PEOPLE, [], NOW)).toBe(false);
  });
});

describe("othersAway（帰宅時: 家が空だったか）", () => {
  it("家に人がいるときに帰っても実行しない、2人とも外にいて1人目が帰ったら実行", () => {
    expect(othersAway("haruki", PEOPLE, [{ profile_slug: "arisa", left_at: null }], NOW)).toBe(false);
    expect(othersAway("haruki", PEOPLE, [{ profile_slug: "arisa", left_at: ago(3) }], NOW)).toBe(true);
  });
});

const dev = (deviceId: string, type: string, infrared = false): DeviceCandidate => ({ deviceId, deviceName: deviceId, type, infrared });
const devices = [
  dev("dining-light", "Ceiling Light"),
  dev("dining-ir-light", "Light", true),
  dev("dining-ac", "Air Conditioner", true),
  dev("living-light", "Ceiling Light Pro"),
  dev("living-ir-light", "DIY Light", true),
  dev("living-ac", "Air Conditioner", true),
  dev("living-tv", "TV", true),
  dev("music-plug", "Plug Mini (JP)"),
  dev("bath-fan", "Battery Circulator Fan"),
  dev("lock", "Smart Lock Pro"),
  dev("keypad", "Keypad Touch"),
  dev("hub", "Hub 2"),
  dev("motion", "Motion Sensor"),
  dev("bot", "Bot"),
  dev("unassigned-bulb", "Color Bulb"),
];
const rooms = {
  "dining-light": "Dining room",
  "dining-ir-light": "Dining room",
  "dining-ac": "Dining room",
  "living-light": "Living room",
  "living-ir-light": "Living room",
  "living-ac": "Living room",
  "living-tv": "Living room",
  lock: "Entrance",
};

describe("planDeparture", () => {
  it("照明は常夜灯、照明以外はオフ。Dining room は照明だけ常夜灯でエアコンはそのまま", () => {
    const plan = planDeparture(devices, rooms, "lock").map((a) => `${a.device.deviceId}:${a.action}`);
    expect(plan).toEqual([
      "dining-light:nightLight",
      "dining-ir-light:nightLight",
      "living-light:nightLight",
      "living-ir-light:nightLight",
      "living-ac:turnOff",
      "music-plug:turnOff",
      "bath-fan:turnOff",
      "unassigned-bulb:nightLight",
    ]);
  });
});

describe("planArrival", () => {
  it("Dining room の照明だけを点ける", () => {
    expect(planArrival(devices, rooms).map((a) => `${a.device.deviceId}:${a.action}`)).toEqual(["dining-light:lightOn", "dining-ir-light:lightOn"]);
  });
});

describe("日の入り", () => {
  const jst = (s: string) => new Date(`${s}+09:00`);

  it("蕨の日の入りをおおよそ正しく計算する（冬至前後は16時半前、夏至前後は19時頃）", () => {
    const nov = sunsetUtc("2026-11-25").getTime();
    expect(Math.abs(nov - jst("2026-11-25T16:28:00").getTime())).toBeLessThan(5 * 60000);
    const jun = sunsetUtc("2026-06-21").getTime();
    expect(Math.abs(jun - jst("2026-06-21T19:01:00").getTime())).toBeLessThan(5 * 60000);
  });

  it("日の入り±10分の間だけtrue", () => {
    const sunset = sunsetUtc("2026-11-25").getTime();
    expect(isNearSunset(new Date(sunset))).toBe(true);
    expect(isNearSunset(new Date(sunset + 9 * 60000))).toBe(true);
    expect(isNearSunset(new Date(sunset - 9 * 60000))).toBe(true);
    expect(isNearSunset(new Date(sunset + 11 * 60000))).toBe(false);
    expect(isNearSunset(jst("2026-11-25T12:00:00"))).toBe(false);
  });
});

describe("motionDetected", () => {
  it("人感センサーのどれかが動きを検知していればtrue", () => {
    expect(motionDetected([{ moveDetected: false }, { moveDetected: true }])).toBe(true);
    expect(motionDetected([{ moveDetected: false }, {}])).toBe(false);
  });
});
