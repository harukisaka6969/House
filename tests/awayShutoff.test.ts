import { describe, it, expect } from "vitest";
import { everyoneAway, selectShutoffTargets, type ShutoffCandidate } from "@/lib/awayShutoff";

const NOW = new Date("2026-11-25T10:00:00Z");
const PEOPLE = ["haruki", "arisa"];
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3600 * 1000).toISOString();

describe("everyoneAway（出発のたびに判定）", () => {
  it("① アリサが家にいて遥希が出発 → 実行しない", () => {
    expect(everyoneAway(PEOPLE, [{ profile_slug: "haruki", left_at: ago(0) }, { profile_slug: "arisa", left_at: null }], NOW)).toBe(false);
  });

  it("② 遥希が家にいてアリサが出発 → 実行しない", () => {
    expect(everyoneAway(PEOPLE, [{ profile_slug: "haruki", left_at: null }, { profile_slug: "arisa", left_at: ago(0) }], NOW)).toBe(false);
  });

  it("③ 2人で出発（2人目の出発時点で2人とも外出中）→ 実行", () => {
    expect(everyoneAway(PEOPLE, [{ profile_slug: "haruki", left_at: ago(0) }, { profile_slug: "arisa", left_at: ago(0.01) }], NOW)).toBe(true);
  });

  it("④⑤ 片方が外にいて、もう片方が出発 → 実行", () => {
    expect(everyoneAway(PEOPLE, [{ profile_slug: "haruki", left_at: ago(0) }, { profile_slug: "arisa", left_at: ago(30) }], NOW)).toBe(true);
    expect(everyoneAway(PEOPLE, [{ profile_slug: "haruki", left_at: ago(50) }, { profile_slug: "arisa", left_at: ago(0) }], NOW)).toBe(true);
  });

  it("帰宅の記録が取りこぼされた古い外出記録は、外出中とみなさない（実行しない側に倒す）", () => {
    expect(everyoneAway(PEOPLE, [{ profile_slug: "haruki", left_at: ago(0) }, { profile_slug: "arisa", left_at: ago(24 * 22) }], NOW)).toBe(false);
  });

  it("記録が無い人は家にいるとみなす", () => {
    expect(everyoneAway(PEOPLE, [{ profile_slug: "haruki", left_at: ago(0) }], NOW)).toBe(false);
    expect(everyoneAway([], [], NOW)).toBe(false);
  });
});

describe("selectShutoffTargets", () => {
  const dev = (deviceId: string, type: string, infrared = false): ShutoffCandidate => ({ deviceId, deviceName: deviceId, type, infrared });
  const devices = [
    dev("dining-light", "Ceiling Light"),
    dev("living-light", "Ceiling Light"),
    dev("living-ac", "Air Conditioner", true),
    dev("living-tv", "TV", true),
    dev("music-plug", "Plug Mini (JP)"),
    dev("bath-fan", "Battery Circulator Fan"),
    dev("lock", "Smart Lock Pro"),
    dev("keypad", "Keypad Touch"),
    dev("hub", "Hub 2"),
    dev("meter", "Meter Plus"),
    dev("bot", "Bot"),
    dev("unassigned-bulb", "Color Bulb"),
  ];
  const rooms = { "dining-light": "Dining room", "living-light": "Living room", "living-ac": "Living room", "living-tv": "Living room", lock: "Entrance" };

  it("Dining room・鍵・センサー類・電源の入切が不確かな機器を除いて、消せるものだけを選ぶ", () => {
    expect(selectShutoffTargets(devices, rooms, "lock").map((d) => d.deviceId)).toEqual([
      "living-light",
      "living-ac",
      "music-plug",
      "bath-fan",
      "unassigned-bulb",
    ]);
  });
});
