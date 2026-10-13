import { describe, expect, test } from "bun:test";
import { change, parseStatsRange, rangeDays } from "@/modules/admin/lib/stats";

describe("parseStatsRange", () => {
  test("keeps a known range", () => {
    expect(parseStatsRange("7d")).toBe("7d");
    expect(parseStatsRange(["90d", "7d"])).toBe("90d");
  });
  test("falls back to 30 days", () => {
    expect(parseStatsRange(undefined)).toBe("30d");
    expect(parseStatsRange("1y")).toBe("30d");
    expect(rangeDays(parseStatsRange("nope"))).toBe(30);
  });
});

describe("change", () => {
  test("up, down and flat in whole percent", () => {
    expect(change(150, 100)).toEqual({ kind: "up", percent: 50 });
    expect(change(25, 100)).toEqual({ kind: "down", percent: 75 });
    expect(change(1001, 1000)).toEqual({ kind: "flat", percent: 0 });
  });
  test("nothing before", () => {
    expect(change(5, 0)).toEqual({ kind: "new" });
    expect(change(0, 0)).toEqual({ kind: "none" });
  });
  test("down to nothing", () => {
    expect(change(0, 40)).toEqual({ kind: "down", percent: 100 });
  });
});
