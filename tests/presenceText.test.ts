import { describe, it, expect } from "vitest";
import { parsePresenceCommand } from "@/lib/presenceText";

describe("parsePresenceCommand", () => {
  it("ただいま・帰宅系は在宅", () => {
    expect(parsePresenceCommand("ただいま")).toBe("home");
    expect(parsePresenceCommand("ただいまー！")).toBe("home");
    expect(parsePresenceCommand("帰宅")).toBe("home");
    expect(parsePresenceCommand("家にいる 🏠")).toBe("home");
  });

  it("いってきます・外出系は外出", () => {
    expect(parsePresenceCommand("いってきます")).toBe("leave");
    expect(parsePresenceCommand("行ってきます！")).toBe("leave");
    expect(parsePresenceCommand("外出")).toBe("leave");
  });

  it("文章の一部に含まれるだけなら反応しない", () => {
    expect(parsePresenceCommand("ただいまコンビニで480円")).toBeNull();
    expect(parsePresenceCommand("外出先でランチ1200円")).toBeNull();
    expect(parsePresenceCommand("")).toBeNull();
  });
});
