import { describe, it, expect } from "vitest";
import { anniversariesOnDate, anniversariesInYear, nextOccurrence, daysUntil, yearsSince } from "@/lib/anniversaryMath";

describe("yearsSince", () => {
  it("computes the number of years elapsed", () => {
    expect(yearsSince("2000-08-08", "2026-08-08")).toBe(26);
    expect(yearsSince("2026-04-25", "2026-04-25")).toBe(0);
  });
});

describe("anniversariesOnDate", () => {
  const rows = [
    { name: "結婚記念日", date: "2026-04-25" },
    { name: "初デート記念日", date: "2023-08-31" },
    { name: "アリサ誕生日", date: "1998-05-30" },
    { name: "遥希誕生日", date: "2000-08-08" },
    { name: "プロポーズ記念日", date: "2025-01-14" },
  ];

  it("matches only rows whose month-day equals today", () => {
    const hits = anniversariesOnDate(rows, "2026-08-08");
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("遥希誕生日");
    expect(hits[0].years).toBe(26);
  });

  it("returns nothing when no anniversary matches today", () => {
    expect(anniversariesOnDate(rows, "2026-03-01")).toHaveLength(0);
  });

  it("phrases birthdays with 歳になります and non-birthdays with 周年", () => {
    const birthday = anniversariesOnDate(rows, "2026-08-08")[0];
    expect(birthday.text).toContain("26歳になります");

    const wedding = anniversariesOnDate(rows, "2027-04-25")[0];
    expect(wedding.text).toContain("1周年");
  });

  it("phrases a same-year (0 years) hit without a count", () => {
    const hit = anniversariesOnDate(rows, "2026-04-25")[0];
    expect(hit.years).toBe(0);
    expect(hit.text).not.toMatch(/\d+周年|\d+歳/);
  });

  it("supports multiple hits on the same day", () => {
    const clashing = [
      { name: "記念日A", date: "2020-06-01" },
      { name: "記念日B", date: "2021-06-01" },
    ];
    expect(anniversariesOnDate(clashing, "2026-06-01")).toHaveLength(2);
  });
});

describe("anniversariesInYear", () => {
  const rows = [
    { name: "結婚記念日", date: "2026-04-25" },
    { name: "遥希誕生日", date: "2000-08-08" },
  ];

  it("excludes anniversaries that had not happened yet in the given year", () => {
    const hits2025 = anniversariesInYear(rows, 2025);
    expect(hits2025.map((h) => h.name)).toEqual(["遥希誕生日"]);
  });

  it("includes an anniversary starting the year it first occurred", () => {
    const hits2026 = anniversariesInYear(rows, 2026);
    expect(hits2026.map((h) => h.name).sort()).toEqual(["結婚記念日", "遥希誕生日"]);
    const wedding = hits2026.find((h) => h.name === "結婚記念日")!;
    expect(wedding.date).toBe("2026-04-25");
    expect(wedding.years).toBe(0);
  });

  it("projects the date onto the requested year", () => {
    const hits2030 = anniversariesInYear(rows, 2030);
    const birthday = hits2030.find((h) => h.name === "遥希誕生日")!;
    expect(birthday.date).toBe("2030-08-08");
    expect(birthday.years).toBe(30);
  });
});

describe("nextOccurrence", () => {
  it("uses this year's date when it has not passed yet", () => {
    expect(nextOccurrence("2000-08-08", "2026-08-01")).toBe("2026-08-08");
  });

  it("rolls over to next year when this year's date already passed", () => {
    expect(nextOccurrence("2000-08-08", "2026-08-09")).toBe("2027-08-08");
  });

  it("treats today itself as not yet passed", () => {
    expect(nextOccurrence("2000-08-08", "2026-08-08")).toBe("2026-08-08");
  });
});

describe("daysUntil", () => {
  it("computes the day difference", () => {
    expect(daysUntil("2026-08-15", "2026-08-09")).toBe(6);
    expect(daysUntil("2026-08-01", "2026-08-09")).toBe(-8);
    expect(daysUntil("2026-08-09", "2026-08-09")).toBe(0);
  });
});
