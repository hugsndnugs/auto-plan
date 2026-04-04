import { fromDatetimeLocalValue } from "@/lib/dates";
import { snapMsToQuarterHour } from "@/lib/dragAnchor";
import type { WorkSettings } from "@/scheduler/types";
import { getDayWorkBounds } from "@/scheduler/workWindows";

const SNAP_MS = 15 * 60 * 1000;

/** Parses `datetime-local` into a snapped ms inside that day's work window. */
export function coerceDatetimeLocalToDropStart(
  datetimeLocal: string,
  workSettings: WorkSettings,
): number | null {
  if (!datetimeLocal.trim()) return null;
  const raw = fromDatetimeLocalValue(datetimeLocal);
  if (!Number.isFinite(raw)) return null;

  const dayStart = new Date(raw);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();

  const bounds = getDayWorkBounds(dayStartMs, workSettings);
  if (!bounds) return null;

  const snapped = snapMsToQuarterHour(raw);
  const lastStart = bounds.endMs - SNAP_MS;
  return Math.max(bounds.startMs, Math.min(snapped, lastStart));
}
