import type { WorkSettings } from "./types";

export function startOfLocalDay(ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getDayWorkBounds(
  dayStartMs: number,
  settings: WorkSettings,
): { startMs: number; endMs: number } | null {
  const d = new Date(dayStartMs);
  const wd = d.getDay();
  if (!settings.workDays[wd]) return null;
  const start = new Date(dayStartMs);
  start.setHours(0, 0, 0, 0);
  start.setMinutes(settings.workStartMinutes);
  const end = new Date(dayStartMs);
  end.setHours(0, 0, 0, 0);
  end.setMinutes(settings.workEndMinutes);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/**
 * First instant work can begin on a local calendar day strictly after the day containing `endMs`.
 * Used when packing sequential jobs so each job occupies its own day(s) without sharing a wall day.
 */
export function alignToStartOfNextWorkDayAfter(
  endMs: number,
  settings: WorkSettings,
  horizonEndMs: number,
): number | null {
  const dayStart = startOfLocalDay(endMs).getTime();
  const nextCalendarDayStart = dayStart + 86400000;
  return alignToNextWorkableInstant(nextCalendarDayStart, settings, horizonEndMs);
}

/**
 * Earliest instant >= `fromMs` where work can start inside a window, or null if none before horizon.
 */
export function alignToNextWorkableInstant(
  fromMs: number,
  settings: WorkSettings,
  horizonEndMs: number,
): number | null {
  let t = fromMs;
  let guard = 0;
  while (guard++ < 10000) {
    if (t >= horizonEndMs) return null;
    const ds = startOfLocalDay(t).getTime();
    const w = getDayWorkBounds(ds, settings);
    if (!w) {
      t = ds + 86400000;
      continue;
    }
    if (t >= w.endMs) {
      t = ds + 86400000;
      continue;
    }
    return Math.max(t, w.startMs);
  }
  return null;
}

export function defaultWorkSettings(): WorkSettings {
  return {
    workStartMinutes: 8 * 60,
    workEndMinutes: 17 * 60,
    workDays: [false, true, true, true, true, true, false],
  };
}
