import { describe, expect, it } from "vitest";
import {
  durationMinutesFromWorkDays,
  minutesPerWorkDay,
  wholeWorkDaysFromDurationMinutes,
} from "./workDayDuration";
import type { WorkSettings } from "@/scheduler/types";

const nineToFive: WorkSettings = {
  workStartMinutes: 8 * 60,
  workEndMinutes: 17 * 60,
  workDays: [false, true, true, true, true, true, false],
};

describe("workDayDuration", () => {
  it("uses configured work window length, not 24 calendar hours", () => {
    const mpd = minutesPerWorkDay(nineToFive);
    expect(mpd).toBe(9 * 60);
    expect(mpd).not.toBe(24 * 60);
  });

  it("maps 1 working day to one full work window in minutes", () => {
    expect(durationMinutesFromWorkDays(1, nineToFive)).toBe(540);
  });

  it("maps N working days to N × work window minutes", () => {
    expect(durationMinutesFromWorkDays(2, nineToFive)).toBe(1080);
    expect(durationMinutesFromWorkDays(3, nineToFive)).toBe(1620);
  });

  it("round-trips whole days from stored minutes", () => {
    expect(wholeWorkDaysFromDurationMinutes(540, nineToFive)).toBe(1);
    expect(wholeWorkDaysFromDurationMinutes(1080, nineToFive)).toBe(2);
  });
});
