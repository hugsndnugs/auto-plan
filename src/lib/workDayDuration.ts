import type { WorkSettings } from "@/scheduler/types";

/** Length of one working day in minutes (not 24×60). */
export function minutesPerWorkDay(settings: WorkSettings): number {
  return Math.max(1, settings.workEndMinutes - settings.workStartMinutes);
}

/** Whole working days only — stored minutes are always N × (length of workday). */
export function durationMinutesFromWorkDays(
  workDays: number,
  settings: WorkSettings,
): number {
  const mpd = minutesPerWorkDay(settings);
  const raw = Math.round(Number(workDays));
  const days = Number.isFinite(raw)
    ? Math.max(1, Math.min(500, raw))
    : 1;
  return Math.max(15, days * mpd);
}

/** How many whole working days best match stored minutes (for edit form). */
export function wholeWorkDaysFromDurationMinutes(
  minutes: number,
  settings: WorkSettings,
): number {
  const mpd = minutesPerWorkDay(settings);
  if (minutes <= 0) return 1;
  return Math.max(1, Math.min(500, Math.round(minutes / mpd)));
}
