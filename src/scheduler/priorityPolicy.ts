import type { Job, Priority } from "./types";

/** Low-priority jobs are deferred this long when auto-placed (no anchor). Calendar days from now. */
export const LOW_PRIORITY_OFFSET_DAYS = 7;

/** Urgent: first segment should start within this window from now (slip warning if later). */
export const URGENT_FIRST_START_WITHIN_MS = 1 * 24 * 60 * 60 * 1000;

/** High auto-placed: earliest first segment is this many calendar days after `addedAtMs`. */
export const HIGH_PRIORITY_AUTO_START_OFFSET_DAYS = 14;

/** After nominal High start (`addedAt` + offset), slip if first segment begins more than this many calendar days later. */
export const HIGH_SLIP_GRACE_DAYS = 7;

export const LOW_PRIORITY_OFFSET_MS = LOW_PRIORITY_OFFSET_DAYS * 86400000;

export const HIGH_PRIORITY_AUTO_START_OFFSET_MS =
  HIGH_PRIORITY_AUTO_START_OFFSET_DAYS * 86400000;

export const HIGH_SLIP_GRACE_MS = HIGH_SLIP_GRACE_DAYS * 86400000;

/**
 * High + planned + no anchor whose 14-day minimum start is still strictly in the future.
 * These pack after other eligible jobs so they do not clear the near-term window for lower tiers.
 */
export function isDeferredAutoPlacedHigh(
  job: Pick<Job, "priority" | "status" | "anchorStartMs" | "addedAtMs">,
  nowMs: number,
): boolean {
  if (
    job.priority !== 2 ||
    job.status !== "planned" ||
    job.anchorStartMs != null
  ) {
    return false;
  }
  const added = job.addedAtMs ?? nowMs;
  return added + HIGH_PRIORITY_AUTO_START_OFFSET_MS > nowMs;
}

/**
 * Earliest instant we may start this job in the pack pass.
 * Low + planned + no anchor: defer so higher tiers get near-term capacity.
 * High + planned + no anchor: defer until `addedAtMs` + 14 calendar days (legacy: `addedAtMs` missing → `nowMs`).
 * Explicit anchor (or in-progress): no automatic High/Low deferral.
 */
export function minimumPackStartMs(
  job: Pick<Job, "priority" | "status" | "anchorStartMs" | "addedAtMs">,
  cursor: number,
  nowMs: number,
): number {
  const anchor = job.anchorStartMs ?? 0;
  let m = Math.max(cursor, anchor, nowMs);
  if (
    job.priority === 0 &&
    job.status === "planned" &&
    job.anchorStartMs == null
  ) {
    m = Math.max(m, nowMs + LOW_PRIORITY_OFFSET_MS);
  }
  const added = job.addedAtMs ?? nowMs;
  if (
    job.priority === 2 &&
    job.status === "planned" &&
    job.anchorStartMs == null
  ) {
    m = Math.max(m, added + HIGH_PRIORITY_AUTO_START_OFFSET_MS);
  }
  return m;
}

export function slipKindForPlacement(
  priority: Priority,
  firstSegmentStartMs: number | undefined,
  nowMs: number,
  addedAtMs?: number,
): "urgent" | "high" | undefined {
  if (firstSegmentStartMs === undefined) return undefined;
  if (
    priority === 3 &&
    firstSegmentStartMs > nowMs + URGENT_FIRST_START_WITHIN_MS
  ) {
    return "urgent";
  }
  if (priority === 2) {
    const added = addedAtMs ?? nowMs;
    const slipThresholdMs =
      added + HIGH_PRIORITY_AUTO_START_OFFSET_MS + HIGH_SLIP_GRACE_MS;
    if (firstSegmentStartMs > slipThresholdMs) {
      return "high";
    }
  }
  return undefined;
}

/**
 * After a manual move (drag / datetime dialog), if the new preferred start is outside the
 * tier’s “weight” window, drop to Normal so the job no longer sorts ahead of other work
 * on priority alone. Uses the same thresholds as {@link slipKindForPlacement} (anchor as proxy
 * for first-segment start).
 */
export function normalPriorityIfOutsideTierWindow(
  job: Pick<Job, "priority" | "status">,
  newAnchorStartMs: number,
  nowMs: number,
  addedAtMs: number,
): Pick<Job, "priority"> | null {
  if (job.status === "done" || job.status === "cancelled") return null;
  if (job.priority === 0 || job.priority === 1) return null;
  if (job.priority === 3) {
    if (newAnchorStartMs > nowMs + URGENT_FIRST_START_WITHIN_MS) {
      return { priority: 1 };
    }
    return null;
  }
  if (job.priority === 2) {
    const slipThresholdMs =
      addedAtMs + HIGH_PRIORITY_AUTO_START_OFFSET_MS + HIGH_SLIP_GRACE_MS;
    if (newAnchorStartMs > slipThresholdMs) {
      return { priority: 1 };
    }
    return null;
  }
  return null;
}
