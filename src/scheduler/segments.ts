import type { Segment, WorkSettings } from "./types";
import { alignToNextWorkableInstant, getDayWorkBounds, startOfLocalDay } from "./workWindows";

/**
 * Consumes `durationMinutes` only inside working windows, starting at or after `startMs`.
 */
export function buildSegments(
  jobId: string,
  startMs: number,
  durationMinutes: number,
  settings: WorkSettings,
  horizonEndMs: number,
): { segments: Segment[]; overflow: boolean; scheduledEndMs: number | null } {
  if (durationMinutes <= 0) {
    return { segments: [], overflow: false, scheduledEndMs: startMs };
  }

  const segments: Segment[] = [];
  let remaining = durationMinutes;
  let cursor = startMs;

  let guard = 0;
  while (remaining > 0 && guard++ < 100000) {
    if (cursor >= horizonEndMs) {
      return { segments, overflow: true, scheduledEndMs: segments.at(-1)?.endMs ?? null };
    }

    const aligned = alignToNextWorkableInstant(cursor, settings, horizonEndMs);
    if (aligned === null) {
      return { segments, overflow: true, scheduledEndMs: segments.at(-1)?.endMs ?? null };
    }

    const dayStart = startOfLocalDay(aligned).getTime();
    const w = getDayWorkBounds(dayStart, settings);
    if (!w || aligned >= w.endMs) {
      cursor = dayStart + 86400000;
      continue;
    }

    const effectiveStart = aligned;
    const availableMin = (w.endMs - effectiveStart) / 60000;
    const take = Math.min(remaining, availableMin);
    const endMs = effectiveStart + take * 60000;

    segments.push({ jobId, startMs: effectiveStart, endMs });
    remaining -= take;
    cursor = endMs;
  }

  if (remaining > 0) {
    return {
      segments,
      overflow: true,
      scheduledEndMs: segments.at(-1)?.endMs ?? null,
    };
  }

  const last = segments.at(-1);
  return {
    segments,
    overflow: false,
    scheduledEndMs: last ? last.endMs : null,
  };
}
