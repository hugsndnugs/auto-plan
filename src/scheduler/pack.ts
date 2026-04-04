import type { Job, JobPlacement, PackResult, Segment, WorkSettings } from "./types";
import { buildSegments } from "./segments";
import {
  isDeferredAutoPlacedHigh,
  minimumPackStartMs,
  slipKindForPlacement,
} from "./priorityPolicy";
import {
  alignToNextWorkableInstant,
  alignToStartOfNextWorkDayAfter,
  startOfLocalDay,
} from "./workWindows";

function remainingMinutes(job: Job): number {
  if (job.status === "done" || job.status === "cancelled") return 0;
  const consumed = job.progressMinutesConsumed ?? 0;
  return Math.max(0, job.durationMinutes - consumed);
}

/**
 * Within the same priority: in-progress packs before planned (so the cursor reflects WIP first).
 * Then jobs with a user anchor sort before auto-placed jobs (used when splitting anchored vs floating).
 * Among anchored jobs, earlier anchor time first. Among unanchored, FIFO by addedAtMs (then id).
 * Deferred auto High (14-day floor still in the future) are sorted only within their tail group; see sortJobsForPack.
 */
function compareJobsForPack(a: Job, b: Job): number {
  if (b.priority !== a.priority) return b.priority - a.priority;

  const aWip = a.status === "in_progress";
  const bWip = b.status === "in_progress";
  if (aWip !== bWip) return aWip ? -1 : 1;

  const aAnchored = a.anchorStartMs != null;
  const bAnchored = b.anchorStartMs != null;
  if (aAnchored !== bAnchored) return aAnchored ? -1 : 1;

  if (aAnchored && bAnchored) {
    const d = a.anchorStartMs! - b.anchorStartMs!;
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  }

  const addA = a.addedAtMs ?? 0;
  const addB = b.addedAtMs ?? 0;
  if (addA !== addB) return addA - addB;
  return a.id.localeCompare(b.id);
}

/** Packs deferred auto High last so near-term capacity is not reserved for them ahead of lower tiers. */
function sortJobsForPack(jobs: Job[], nowMs: number): Job[] {
  const rest = jobs.filter((j) => !isDeferredAutoPlacedHigh(j, nowMs));
  const deferred = jobs.filter((j) => isDeferredAutoPlacedHigh(j, nowMs));
  return [
    ...[...rest].sort(compareJobsForPack),
    ...[...deferred].sort(compareJobsForPack),
  ];
}

export interface PackOptions {
  settings: WorkSettings;
  /** Schedule segments from this instant onward */
  horizonStartMs: number;
  horizonEndMs: number;
  /** Planned jobs cannot start before this */
  nowMs: number;
}

function addSegmentDaysToBusy(segments: Segment[], busy: Set<number>): void {
  for (const s of segments) {
    busy.add(startOfLocalDay(s.startMs).getTime());
  }
}

/** Earliest local day start among segments that already has another job. */
function firstBusyDayInSegments(
  segments: Segment[],
  busy: Set<number>,
): number | null {
  let minDay: number | null = null;
  for (const s of segments) {
    const d = startOfLocalDay(s.startMs).getTime();
    if (busy.has(d) && (minDay === null || d < minDay)) {
      minDay = d;
    }
  }
  return minDay;
}

function placementForBuiltJob(
  job: Job,
  segments: Segment[],
  overflow: boolean,
  scheduledEndMs: number | null,
  nowMs: number,
): JobPlacement {
  const firstStart = segments[0]?.startMs;
  const slip = overflow
    ? undefined
    : slipKindForPlacement(job.priority, firstStart, nowMs, job.addedAtMs);
  return {
    jobId: job.id,
    segments,
    overflow,
    scheduledEndMs,
    ...(slip ? { slip } : {}),
  };
}

function overflowPlacement(jobId: string): JobPlacement {
  return {
    jobId,
    segments: [],
    overflow: true,
    scheduledEndMs: null,
  };
}

function packAnchoredPhase(
  anchored: Job[],
  options: PackOptions,
  busy: Set<number>,
  placements: JobPlacement[],
  allSegments: Segment[],
): void {
  const { settings, horizonStartMs, horizonEndMs, nowMs } = options;
  let cursor = Math.max(horizonStartMs, nowMs);

  for (const job of anchored) {
    const rem = remainingMinutes(job);
    if (rem <= 0) continue;

    let startMs = minimumPackStartMs(job, cursor, nowMs);
    const aligned = alignToNextWorkableInstant(
      startMs,
      settings,
      horizonEndMs,
    );
    if (aligned === null) {
      placements.push(overflowPlacement(job.id));
      continue;
    }
    startMs = aligned;

    const { segments, overflow, scheduledEndMs } = buildSegments(
      job.id,
      startMs,
      rem,
      settings,
      horizonEndMs,
    );

    for (const s of segments) allSegments.push(s);
    addSegmentDaysToBusy(segments, busy);

    placements.push(
      placementForBuiltJob(job, segments, overflow, scheduledEndMs, nowMs),
    );

    if (scheduledEndMs !== null) {
      const nextDayStart = alignToStartOfNextWorkDayAfter(
        scheduledEndMs,
        settings,
        horizonEndMs,
      );
      cursor = nextDayStart ?? scheduledEndMs;
    }
  }
}

type FloatTry =
  | { kind: "align_fail" }
  | { kind: "overflow"; segments: Segment[]; scheduledEndMs: number | null }
  | { kind: "retry"; tryMin: number }
  | { kind: "ok"; segments: Segment[]; scheduledEndMs: number | null };

function tryFloatingAt(
  job: Job,
  rem: number,
  tryMin: number,
  busy: Set<number>,
  settings: WorkSettings,
  horizonEndMs: number,
): FloatTry {
  const aligned = alignToNextWorkableInstant(tryMin, settings, horizonEndMs);
  if (aligned === null) return { kind: "align_fail" };

  const startMs = aligned;
  const built = buildSegments(
    job.id,
    startMs,
    rem,
    settings,
    horizonEndMs,
  );

  if (built.overflow) {
    return {
      kind: "overflow",
      segments: built.segments,
      scheduledEndMs: built.scheduledEndMs,
    };
  }

  const conflictDay = firstBusyDayInSegments(built.segments, busy);
  if (conflictDay === null) {
    return {
      kind: "ok",
      segments: built.segments,
      scheduledEndMs: built.scheduledEndMs,
    };
  }

  const nextFromConflict = alignToNextWorkableInstant(
    conflictDay + 86400000,
    settings,
    horizonEndMs,
  );
  if (nextFromConflict === null || nextFromConflict <= startMs) {
    return { kind: "align_fail" };
  }
  return { kind: "retry", tryMin: nextFromConflict };
}

function placeFloatingJob(
  job: Job,
  rem: number,
  cursorFloat: number,
  busy: Set<number>,
  options: PackOptions,
  placements: JobPlacement[],
  allSegments: Segment[],
): number {
  const { settings, horizonEndMs, nowMs } = options;
  let tryMin = minimumPackStartMs(job, cursorFloat, nowMs);
  const maxAttempts = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const r = tryFloatingAt(
      job,
      rem,
      tryMin,
      busy,
      settings,
      horizonEndMs,
    );

    if (r.kind === "retry") {
      tryMin = r.tryMin;
      continue;
    }

    if (r.kind === "align_fail") {
      placements.push(overflowPlacement(job.id));
      return cursorFloat;
    }

    if (r.kind === "overflow") {
      for (const s of r.segments) allSegments.push(s);
      addSegmentDaysToBusy(r.segments, busy);
      placements.push(
        placementForBuiltJob(job, r.segments, true, r.scheduledEndMs, nowMs),
      );
      return cursorFloat;
    }

    for (const s of r.segments) allSegments.push(s);
    addSegmentDaysToBusy(r.segments, busy);
    placements.push(
      placementForBuiltJob(job, r.segments, false, r.scheduledEndMs, nowMs),
    );
    if (r.scheduledEndMs !== null) {
      const nextDayStart = alignToStartOfNextWorkDayAfter(
        r.scheduledEndMs,
        settings,
        horizonEndMs,
      );
      return nextDayStart ?? r.scheduledEndMs;
    }
    return cursorFloat;
  }

  placements.push(overflowPlacement(job.id));
  return cursorFloat;
}

function packFloatingPhase(
  floating: Job[],
  options: PackOptions,
  busy: Set<number>,
  placements: JobPlacement[],
  allSegments: Segment[],
): void {
  const { horizonStartMs, nowMs } = options;
  let cursorFloat = Math.max(horizonStartMs, nowMs);

  for (const job of floating) {
    const rem = remainingMinutes(job);
    if (rem <= 0) continue;
    cursorFloat = placeFloatingJob(
      job,
      rem,
      cursorFloat,
      busy,
      options,
      placements,
      allSegments,
    );
  }
}

function packOneGroup(
  group: Job[],
  options: PackOptions,
  busyIn: Set<number>,
): {
  placements: JobPlacement[];
  allSegments: Segment[];
  busyOut: Set<number>;
} {
  const busy = new Set(busyIn);
  const placements: JobPlacement[] = [];
  const allSegments: Segment[] = [];

  const anchored = group.filter((j) => j.anchorStartMs != null);
  const floating = group.filter((j) => j.anchorStartMs == null);

  packAnchoredPhase(anchored, options, busy, placements, allSegments);
  packFloatingPhase(floating, options, busy, placements, allSegments);

  return { placements, allSegments, busyOut: busy };
}

/**
 * Packs active jobs (planned + in_progress) in priority order. Anchored jobs (preferred start) are
 * placed in a first pass and reserve their calendar days; unanchored jobs then fill remaining work
 * days from the horizon without leaving gaps before those reservations. After each job, the cursor
 * moves to the next workday so jobs do not share a wall-calendar day.
 */
export function packJobs(jobs: Job[], options: PackOptions): PackResult {
  const { nowMs } = options;

  const active = jobs.filter(
    (j) => j.status === "planned" || j.status === "in_progress",
  );
  const ordered = sortJobsForPack(active, nowMs);

  const main = ordered.filter((j) => !isDeferredAutoPlacedHigh(j, nowMs));
  const deferred = ordered.filter((j) => isDeferredAutoPlacedHigh(j, nowMs));

  const allSegments: Segment[] = [];
  const placements: JobPlacement[] = [];
  let busy = new Set<number>();

  const a = packOneGroup(main, options, busy);
  placements.push(...a.placements);
  allSegments.push(...a.allSegments);
  busy = a.busyOut;

  const b = packOneGroup(deferred, options, busy);
  placements.push(...b.placements);
  allSegments.push(...b.allSegments);

  return { placements, allSegments };
}
