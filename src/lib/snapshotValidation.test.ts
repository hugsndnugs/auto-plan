import { describe, expect, it } from "vitest";
import {
  assertValidPlannerSnapshot,
  MAX_JOBS,
  sanitizePersistedPlannerSlice,
} from "./snapshotValidation";
import { defaultWorkSettings } from "@/scheduler/workWindows";

describe("assertValidPlannerSnapshot", () => {
  it("accepts a minimal valid snapshot", () => {
    const snap = assertValidPlannerSnapshot({
      version: 1,
      jobs: [
        {
          id: "a",
          title: "T",
          durationMinutes: 60,
          priority: 1,
          anchorStartMs: null,
          status: "planned",
        },
      ],
      workSettings: defaultWorkSettings(),
      viewRangeStartMs: 1_700_000_000_000,
      viewMode: "week",
    });
    expect(snap.jobs).toHaveLength(1);
    expect(snap.jobs[0].title).toBe("T");
  });

  it("rejects wrong version", () => {
    expect(() =>
      assertValidPlannerSnapshot({
        version: 2,
        jobs: [],
        workSettings: defaultWorkSettings(),
      }),
    ).toThrow(/Invalid backup file/);
  });

  it("rejects bad job priority", () => {
    expect(() =>
      assertValidPlannerSnapshot({
        version: 1,
        jobs: [
          {
            id: "x",
            title: "T",
            durationMinutes: 1,
            priority: 99,
            anchorStartMs: null,
            status: "planned",
          },
        ],
        workSettings: defaultWorkSettings(),
        viewRangeStartMs: 0,
      }),
    ).toThrow(/bad priority/);
  });

  it("rejects too many jobs", () => {
    const jobs = Array.from({ length: MAX_JOBS + 1 }, (_, i) => ({
      id: `j${i}`,
      title: "x",
      durationMinutes: 1,
      priority: 1 as const,
      anchorStartMs: null,
      status: "planned" as const,
    }));
    expect(() =>
      assertValidPlannerSnapshot({
        version: 1,
        jobs,
        workSettings: defaultWorkSettings(),
        viewRangeStartMs: 0,
      }),
    ).toThrow(/too many jobs/);
  });
});

describe("sanitizePersistedPlannerSlice", () => {
  it("returns defaults for garbage input", () => {
    const s = sanitizePersistedPlannerSlice(null);
    expect(s.jobs).toEqual([]);
    expect(s.viewMode).toBe("week");
  });

  it("repairs jobs with invalid priority", () => {
    const s = sanitizePersistedPlannerSlice({
      jobs: [
        {
          id: "k",
          title: "Ok",
          durationMinutes: 30,
          priority: 9,
          anchorStartMs: null,
          status: "planned",
        },
      ],
      workSettings: defaultWorkSettings(),
      viewRangeStartMs: 1,
      viewMode: "month",
    });
    expect(s.jobs[0].priority).toBe(1);
  });
});
