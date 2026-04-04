import { describe, expect, it } from "vitest";
import { coerceDatetimeLocalToDropStart } from "./segmentMove";
import type { WorkSettings } from "@/scheduler/types";

function settingsMonFri9to5(): WorkSettings {
  return {
    workStartMinutes: 9 * 60,
    workEndMinutes: 17 * 60,
    workDays: [false, true, true, true, true, true, false],
  };
}

describe("coerceDatetimeLocalToDropStart", () => {
  it("returns null for empty input", () => {
    expect(coerceDatetimeLocalToDropStart("", settingsMonFri9to5())).toBeNull();
  });

  it("returns null on a non-working day", () => {
    const s = settingsMonFri9to5();
    expect(
      coerceDatetimeLocalToDropStart("2028-06-04T10:00", s),
    ).toBeNull();
  });

  it("snaps and clamps into the work window on a working day", () => {
    const s = settingsMonFri9to5();
    const mon = "2028-06-05T10:07";
    const out = coerceDatetimeLocalToDropStart(mon, s);
    expect(out).not.toBeNull();
    const d = new Date(out!);
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(0);
  });

  it("clamps time before work start to window start", () => {
    const s = settingsMonFri9to5();
    const out = coerceDatetimeLocalToDropStart("2028-06-05T06:00", s);
    expect(out).not.toBeNull();
    const d = new Date(out!);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });
});
