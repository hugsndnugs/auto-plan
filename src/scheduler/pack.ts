import type { Job, JobPlacement, PackResult, WorkSettings } from "./types";
import { buildSegments } from "./segments";
import {
  isDeferredAutoPlacedHigh,
  minimumPackStartMs,
  slipKindForPlacement,
} from "./priorityPolicy";
import {
  alignToNextWorkableInstant,
  alignToStartOfNextWorkDayAfter,
} from "./workWindows";

function remainingMinutes(job: Job): number {
  if (job.status === "done" || job.status === "cancelled") return 0;
  const consumed = job.progressMinutesConsumed ?? 0;
  return Math.max(0, job.durationMinutes - consumed);
}

/**
 * Within the same priority: in-progress packs before planned (so the cursor reflects WIP first).
 * Then jobs with a user anchor pack before auto-placed jobs, so dragging can claim a slot ahead
 * of older unanchored work. Among anchored jobs, earlier anchor time first. Among unanchored,
 * FIFO by addedAtMs. Deferred auto High (14-day floor still in the future) are sorted only
 * within their tail group; see sortJobsForPack.
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

/**
 * Packs active jobs (planned + in_progress) in priority order; within a tier, in-progress first,
 * then anchored before unanchored, FIFO by addedAtMs (then id). After each job, the cursor moves to
 * the next workday so jobs do not share a wall-calendar day (each job gets its own day(s)).
 */
export function packJobs(jobs: Job[], options: PackOptions): PackResult {
  const { settings, horizonStartMs, horizonEndMs, nowMs } = options;

  const active = jobs.filter(
    (j) => j.status === "planned" || j.status === "in_progress",
  );
  const ordered = sortJobsForPack(active, nowMs);

  let cursor = Math.max(horizonStartMs, nowMs);
  const placements: JobPlacement[] = [];
  const allSegments: import("./types").Segment[] = [];

  for (const job of ordered) {
    const rem = remainingMinutes(job);
    if (rem <= 0) continue;

    let startMs = minimumPackStartMs(job, cursor, nowMs);

    const aligned = alignToNextWorkableInstant(startMs, settings, horizonEndMs);
    if (aligned === null) {
      placements.push({
        jobId: job.id,
        segments: [],
        overflow: true,
        scheduledEndMs: null,
      });
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

    const firstStart = segments[0]?.startMs;
    const slip = overflow
      ? undefined
      : slipKindForPlacement(job.priority, firstStart, nowMs, job.addedAtMs);

    placements.push({
      jobId: job.id,
      segments,
      overflow,
      scheduledEndMs,
      ...(slip ? { slip } : {}),
    });

    if (scheduledEndMs !== null) {
      const nextDayStart = alignToStartOfNextWorkDayAfter(
        scheduledEndMs,
        settings,
        horizonEndMs,
      );
      cursor = nextDayStart ?? scheduledEndMs;
    }
  }

  return { placements, allSegments };
}
