import type { DragEvent as ReactDragEvent } from "react";
import type { JobPlacement, WorkSettings } from "@/scheduler/types";
import { getDayWorkBounds } from "@/scheduler/workWindows";

const SNAP_MS = 15 * 60 * 1000;

export const DRAG_MIME = "application/x-autoplan-seg";

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Hides the default drag image so the source doesn’t look like a duplicate block. */
export function setSegmentDragPayload(
  e: ReactDragEvent<Element>,
  payload: { jobId: string; segmentStartMs: number },
): void {
  const dt = e.dataTransfer;
  if (!dt) return;
  dt.effectAllowed = "move";
  dt.setData(DRAG_MIME, JSON.stringify(payload));
  const img = new Image();
  img.src = TRANSPARENT_PIXEL;
  dt.setDragImage(img, 0, 0);
}

export function snapMsToQuarterHour(ms: number): number {
  return Math.round(ms / SNAP_MS) * SNAP_MS;
}

/**
 * New preferred start when user drops a segment so it begins at `dropStartMs`.
 * Shifts the whole job by (dropStartMs - draggedSegmentStartMs).
 */
export function anchorAfterSegmentMove(
  placements: JobPlacement[],
  jobId: string,
  draggedSegmentStartMs: number,
  dropStartMs: number,
): number | null {
  const placement = placements.find((p) => p.jobId === jobId);
  if (!placement?.segments.length) return null;
  const sorted = [...placement.segments].sort((a, b) => a.startMs - b.startMs);
  const first = sorted[0];
  const delta = dropStartMs - draggedSegmentStartMs;
  return first.startMs + delta;
}

export function timeAtTrackY(
  clientY: number,
  trackRect: DOMRect,
  dayStartMs: number,
  settings: WorkSettings,
): number | null {
  const h = trackRect.height;
  if (h <= 0) return null;
  const y = clientY - trackRect.top;
  const frac = Math.max(0, Math.min(1, y / h));
  const bounds = getDayWorkBounds(dayStartMs, settings);
  if (!bounds) return null;
  const raw = bounds.startMs + frac * (bounds.endMs - bounds.startMs);
  const snapped = snapMsToQuarterHour(raw);
  const lastStart = bounds.endMs - SNAP_MS;
  return Math.max(bounds.startMs, Math.min(snapped, lastStart));
}
