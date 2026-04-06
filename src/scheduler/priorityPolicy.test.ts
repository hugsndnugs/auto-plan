import { describe, expect, it } from "vitest";
import {
  HIGH_PRIORITY_AUTO_START_OFFSET_MS,
  HIGH_SLIP_GRACE_MS,
  minimumPackStartMs,
  normalPriorityIfOutsideTierWindow,
  slipKindForPlacement,
  URGENT_FIRST_START_WITHIN_MS,
} from "./priorityPolicy";
import type { Job } from "./types";

const baseJob: Pick<
  Job,
  "priority" | "status" | "anchorStartMs" | "addedAtMs"
> = {
  priority: 1,
  status: "planned",
  anchorStartMs: null,
};

describe("minimumPackStartMs", () => {
  it("defers planned High without anchor until addedAt + 14 days", () => {
    const addedAt = 1_000_000;
    const nowMs = addedAt + 10 * 86400000;
    const m = minimumPackStartMs(
      { ...baseJob, priority: 2, addedAtMs: addedAt },
      0,
      nowMs,
    );
    expect(m).toBe(addedAt + HIGH_PRIORITY_AUTO_START_OFFSET_MS);
  });

  it("does not defer High when anchor is set", () => {
    const anchor = 5_000_000;
    const nowMs = 1_000_000;
    const m = minimumPackStartMs(
      {
        ...baseJob,
        priority: 2,
        anchorStartMs: anchor,
        addedAtMs: 0,
      },
      0,
      nowMs,
    );
    expect(m).toBe(anchor);
  });

  it("does not apply High deferral for in_progress", () => {
    const nowMs = 10_000_000;
    const m = minimumPackStartMs(
      {
        ...baseJob,
        priority: 2,
        status: "in_progress",
        addedAtMs: 0,
      },
      0,
      nowMs,
    );
    expect(m).toBe(nowMs);
  });
});

describe("slipKindForPlacement", () => {
  it("flags High slip when first segment is after added + 14d + grace", () => {
    const addedAt = 1_000_000;
    const nowMs = addedAt + 5 * 86400000;
    const threshold = addedAt + HIGH_PRIORITY_AUTO_START_OFFSET_MS + HIGH_SLIP_GRACE_MS;
    expect(
      slipKindForPlacement(2, threshold + 1, nowMs, addedAt),
    ).toBe("high");
    expect(
      slipKindForPlacement(2, threshold, nowMs, addedAt),
    ).toBeUndefined();
  });

  it("uses nowMs as addedAt when missing (legacy)", () => {
    const nowMs = 10_000_000;
    const threshold =
      nowMs + HIGH_PRIORITY_AUTO_START_OFFSET_MS + HIGH_SLIP_GRACE_MS;
    expect(slipKindForPlacement(2, threshold + 1, nowMs, undefined)).toBe(
      "high",
    );
    expect(slipKindForPlacement(2, threshold, nowMs, undefined)).toBeUndefined();
  });
});

describe("normalPriorityIfOutsideTierWindow", () => {
  const nowMs = 1_000_000;

  it("demotes Urgent when new anchor is after urgent window", () => {
    expect(
      normalPriorityIfOutsideTierWindow(
        { priority: 3, status: "planned" },
        nowMs + URGENT_FIRST_START_WITHIN_MS + 1,
        nowMs,
        0,
      ),
    ).toEqual({ priority: 1 });
  });

  it("leaves Urgent when new anchor is inside urgent window", () => {
    expect(
      normalPriorityIfOutsideTierWindow(
        { priority: 3, status: "planned" },
        nowMs + URGENT_FIRST_START_WITHIN_MS,
        nowMs,
        0,
      ),
    ).toBeNull();
  });

  it("demotes High when new anchor is past slip threshold", () => {
    const addedAt = 100;
    const threshold =
      addedAt + HIGH_PRIORITY_AUTO_START_OFFSET_MS + HIGH_SLIP_GRACE_MS;
    expect(
      normalPriorityIfOutsideTierWindow(
        { priority: 2, status: "planned" },
        threshold + 1,
        nowMs,
        addedAt,
      ),
    ).toEqual({ priority: 1 });
    expect(
      normalPriorityIfOutsideTierWindow(
        { priority: 2, status: "planned" },
        threshold,
        nowMs,
        addedAt,
      ),
    ).toBeNull();
  });

  it("does not change Normal or finished jobs", () => {
    expect(
      normalPriorityIfOutsideTierWindow(
        { priority: 1, status: "planned" },
        nowMs + 999 * 86400000,
        nowMs,
        0,
      ),
    ).toBeNull();
    expect(
      normalPriorityIfOutsideTierWindow(
        { priority: 3, status: "done" },
        nowMs + 999 * 86400000,
        nowMs,
        0,
      ),
    ).toBeNull();
  });
});
