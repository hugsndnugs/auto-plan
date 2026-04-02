import { describe, expect, it } from "vitest";
import { buildSegments } from "./segments";
import { packJobs } from "./pack";
import { repackAfterEarlyFinish } from "./earlyFinish";
import type { Job, WorkSettings } from "./types";
import {
  HIGH_PRIORITY_AUTO_START_OFFSET_MS,
  LOW_PRIORITY_OFFSET_MS,
} from "./priorityPolicy";
import { defaultWorkSettings } from "./workWindows";

const settings: WorkSettings = {
  workStartMinutes: 8 * 60,
  workEndMinutes: 17 * 60,
  workDays: [false, true, true, true, true, true, false],
};

/** Monday 08:00 UTC */
const MON_8 = Date.UTC(2026, 0, 5, 8, 0, 0);
const HORIZON = MON_8 + 14 * 86400000;
/** Long horizon for High 14-day deferral tests */
const HORIZON_LONG = MON_8 + 120 * 86400000;
/** Default addedAt so High jobs in existing tests are not pushed +14d from now */
const DEFAULT_ADDED_AT_MS = MON_8 - 90 * 86400000;

function job(
  partial: Pick<Job, "durationMinutes" | "priority" | "status"> &
    Partial<Omit<Job, "durationMinutes" | "priority" | "status">> & {
      id?: string;
    },
): Job {
  return {
    id: partial.id ?? "j1",
    title: partial.title ?? "Job",
    durationMinutes: partial.durationMinutes,
    priority: partial.priority,
    anchorStartMs: partial.anchorStartMs ?? null,
    status: partial.status,
    progressMinutesConsumed: partial.progressMinutesConsumed,
    actualEndMs: partial.actualEndMs,
    notes: partial.notes,
    deadlineMs: partial.deadlineMs,
    addedAtMs: partial.addedAtMs ?? DEFAULT_ADDED_AT_MS,
  };
}

describe("buildSegments", () => {
  it("fills one segment within a day", () => {
    const { segments, overflow, scheduledEndMs } = buildSegments(
      "a",
      MON_8,
      120,
      settings,
      HORIZON,
    );
    expect(overflow).toBe(false);
    expect(segments).toHaveLength(1);
    expect(segments[0].startMs).toBe(MON_8);
    expect(segments[0].endMs).toBe(MON_8 + 120 * 60000);
    expect(scheduledEndMs).toBe(segments[0].endMs);
  });

  it("spills across multiple working days", () => {
    // 9h Monday + 9h Tuesday = 18h = 1080 min; request 600 min (10h) → Mon 9h + Tue 1h
    const { segments, overflow } = buildSegments(
      "a",
      MON_8,
    600,
      settings,
      HORIZON,
    );
    expect(overflow).toBe(false);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    const monEnd = Date.UTC(2026, 0, 5, 17, 0, 0);
    expect(segments[0].endMs).toBe(monEnd);
    const tue8 = Date.UTC(2026, 0, 6, 8, 0, 0);
    expect(segments[1].startMs).toBe(tue8);
    const totalMin = segments.reduce(
      (s, seg) => s + (seg.endMs - seg.startMs) / 60000,
      0,
    );
    expect(totalMin).toBe(600);
  });

  it("overflows when horizon is too short", () => {
    const short = MON_8 + 4 * 60000;
    const { overflow } = buildSegments("a", MON_8, 10000, settings, short);
    expect(overflow).toBe(true);
  });
});

describe("packJobs", () => {
  it("orders by priority (urgent first)", () => {
    const jobs: Job[] = [
      job({
        id: "low",
        durationMinutes: 60,
        priority: 0,
        status: "planned",
      }),
      job({
        id: "urgent",
        durationMinutes: 60,
        priority: 3,
        status: "planned",
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON,
      nowMs: MON_8,
    });
    expect(placements[0].jobId).toBe("urgent");
    expect(placements[1].jobId).toBe("low");
    const uEnd = placements[0].scheduledEndMs!;
    expect(placements[1].segments[0].startMs).toBeGreaterThanOrEqual(uEnd);
  });

  it("defers low priority without anchor until after the offset window", () => {
    const jobs: Job[] = [
      job({
        id: "n",
        durationMinutes: 60,
        priority: 1,
        status: "planned",
      }),
      job({
        id: "l",
        durationMinutes: 60,
        priority: 0,
        status: "planned",
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON,
      nowMs: MON_8,
    });
    const low = placements.find((p) => p.jobId === "l")!;
    expect(low.segments[0].startMs).toBeGreaterThanOrEqual(
      MON_8 + LOW_PRIORITY_OFFSET_MS,
    );
  });

  it("orders same priority by addedAtMs so newer jobs pack later (FIFO within tier)", () => {
    const older = DEFAULT_ADDED_AT_MS;
    const newer = older + 86400000;
    const jobs: Job[] = [
      job({
        id: "long",
        durationMinutes: 120,
        priority: 3,
        status: "planned",
        addedAtMs: newer,
      }),
      job({
        id: "short",
        durationMinutes: 60,
        priority: 3,
        status: "planned",
        addedAtMs: older,
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON,
      nowMs: MON_8,
    });
    expect(placements[0].jobId).toBe("short");
    expect(placements[1].jobId).toBe("long");
  });

  it("packs anchored jobs before unanchored at the same priority", () => {
    const jobs: Job[] = [
      job({
        id: "auto",
        durationMinutes: 60,
        priority: 1,
        status: "planned",
        addedAtMs: DEFAULT_ADDED_AT_MS - 999999999,
        anchorStartMs: null,
      }),
      job({
        id: "pinned",
        durationMinutes: 60,
        priority: 1,
        status: "planned",
        addedAtMs: DEFAULT_ADDED_AT_MS,
        anchorStartMs: MON_8 + 4 * 3600000,
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON,
      nowMs: MON_8,
    });
    expect(placements[0].jobId).toBe("pinned");
    expect(placements[1].jobId).toBe("auto");
  });

  it("respects sequential cursor after multi-day job", () => {
    const jobs: Job[] = [
      job({
        id: "big",
        durationMinutes: 600,
        priority: 2,
        status: "planned",
      }),
      job({
        id: "after",
        durationMinutes: 60,
        priority: 1,
        status: "planned",
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON,
      nowMs: MON_8,
    });
    const bigEnd = placements.find((p) => p.jobId === "big")!.scheduledEndMs!;
    const afterStart = placements.find((p) => p.jobId === "after")!.segments[0]
      .startMs;
    expect(afterStart).toBeGreaterThanOrEqual(bigEnd);
  });

  it("skips done and cancelled", () => {
    const jobs: Job[] = [
      job({ id: "d", durationMinutes: 60, priority: 1, status: "done" }),
      job({ id: "c", durationMinutes: 60, priority: 1, status: "cancelled" }),
      job({ id: "p", durationMinutes: 60, priority: 0, status: "planned" }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON,
      nowMs: MON_8,
    });
    expect(placements.map((p) => p.jobId)).toEqual(["p"]);
  });

  it("defers high priority without anchor until at least 14 days after addedAtMs", () => {
    const addedAtMs = MON_8 - 86400000;
    const jobs: Job[] = [
      job({
        id: "h",
        durationMinutes: 60,
        priority: 2,
        status: "planned",
        addedAtMs,
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON_LONG,
      nowMs: MON_8,
    });
    const firstStart = placements[0].segments[0].startMs;
    expect(firstStart).toBeGreaterThanOrEqual(
      addedAtMs + HIGH_PRIORITY_AUTO_START_OFFSET_MS,
    );
  });

  it("high priority with anchor ignores 14-day deferral", () => {
    const addedAtMs = MON_8 - 86400000;
    const jobs: Job[] = [
      job({
        id: "h",
        durationMinutes: 60,
        priority: 2,
        status: "planned",
        anchorStartMs: MON_8,
        addedAtMs,
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON_LONG,
      nowMs: MON_8,
    });
    expect(placements[0].segments[0].startMs).toBe(MON_8);
  });

  it("packs Normal before deferred auto High so near-term work is not displaced", () => {
    const jobs: Job[] = [
      job({
        id: "n",
        durationMinutes: 60,
        priority: 1,
        status: "planned",
      }),
      job({
        id: "h",
        durationMinutes: 60,
        priority: 2,
        status: "planned",
        addedAtMs: MON_8,
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON_LONG,
      nowMs: MON_8,
    });
    const n = placements.find((p) => p.jobId === "n")!;
    const h = placements.find((p) => p.jobId === "h")!;
    expect(n.segments[0].startMs).toBeLessThan(h.segments[0].startMs);
    expect(h.segments[0].startMs).toBeGreaterThanOrEqual(
      MON_8 + HIGH_PRIORITY_AUTO_START_OFFSET_MS,
    );
  });

  it("still packs non-deferred High before Normal when 14-day floor is in the past", () => {
    const jobs: Job[] = [
      job({
        id: "n",
        durationMinutes: 60,
        priority: 1,
        status: "planned",
      }),
      job({
        id: "h",
        durationMinutes: 60,
        priority: 2,
        status: "planned",
        addedAtMs: DEFAULT_ADDED_AT_MS,
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON_LONG,
      nowMs: MON_8,
    });
    expect(placements[0].jobId).toBe("h");
    expect(placements[1].jobId).toBe("n");
  });

  it("orders multiple deferred auto High jobs FIFO by addedAtMs in the tail group", () => {
    const older = MON_8 - 2 * 86400000;
    const newer = MON_8 - 86400000;
    const jobs: Job[] = [
      job({
        id: "hNew",
        durationMinutes: 60,
        priority: 2,
        status: "planned",
        addedAtMs: newer,
      }),
      job({
        id: "hOld",
        durationMinutes: 60,
        priority: 2,
        status: "planned",
        addedAtMs: older,
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON_LONG,
      nowMs: MON_8,
    });
    expect(placements.map((p) => p.jobId)).toEqual(["hOld", "hNew"]);
  });

  it("uses remaining minutes for in_progress", () => {
    const jobs: Job[] = [
      job({
        id: "wip",
        durationMinutes: 120,
        priority: 1,
        status: "in_progress",
        progressMinutesConsumed: 90,
      }),
    ];
    const { placements } = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON,
      nowMs: MON_8,
    });
    const segs = placements[0].segments;
    const mins = segs.reduce(
      (s, g) => s + (g.endMs - g.startMs) / 60000,
      0,
    );
    expect(mins).toBe(30);
  });
});

describe("repackAfterEarlyFinish", () => {
  it("pulls following job earlier when first job finishes early", () => {
    const jobs: Job[] = [
      job({
        id: "a",
        durationMinutes: 480,
        priority: 2,
        status: "planned",
      }),
      job({
        id: "b",
        durationMinutes: 60,
        priority: 1,
        status: "planned",
      }),
    ];
    const packed = packJobs(jobs, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON,
      nowMs: MON_8,
    });
    const aEndOriginal = packed.placements.find((p) => p.jobId === "a")!
      .scheduledEndMs!;
    const early = MON_8 + 2 * 60 * 60000;
    expect(early).toBeLessThan(aEndOriginal);

    const jobsDoneA = jobs.map((j) =>
      j.id === "a"
        ? { ...j, status: "done" as const, actualEndMs: early }
        : j,
    );
    const repacked = repackAfterEarlyFinish(jobsDoneA, "a", early, {
      settings,
      horizonStartMs: MON_8,
      horizonEndMs: HORIZON,
      nowMs: early,
    });
    const bStart = repacked.placements.find((p) => p.jobId === "b")!.segments[0]
      .startMs;
    expect(bStart).toBeLessThan(
      packJobs(jobs, {
        settings,
        horizonStartMs: MON_8,
        horizonEndMs: HORIZON,
        nowMs: MON_8,
      }).placements.find((p) => p.jobId === "b")!.segments[0].startMs,
    );
  });
});

describe("defaultWorkSettings", () => {
  it("matches pack expectations", () => {
    const d = defaultWorkSettings();
    expect(d.workStartMinutes).toBe(8 * 60);
    expect(d.workEndMinutes).toBe(17 * 60);
  });
});
