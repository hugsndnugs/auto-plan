import type { Job, JobStatus, Priority, WorkSettings } from "@/scheduler/types";
import type { PlannerSnapshot, ViewMode } from "@/store/plannerTypes";
import { startOfWeekMonday } from "@/lib/dates";
import { defaultWorkSettings } from "@/scheduler/workWindows";

/** Limits malicious / accidental huge imports and localStorage blobs. */
export const MAX_BACKUP_JSON_CHARS = 12_000_000;
export const MAX_JOBS = 5_000;
export const MAX_ID_LEN = 128;
export const MAX_TITLE_LEN = 2_000;
export const MAX_NOTES_LEN = 50_000;
/** ~19 years at 1 min granularity */
export const MAX_DURATION_MINUTES = 10_000_000;

const PRIORITIES = new Set<Priority>([0, 1, 2, 3]);
const STATUSES = new Set<JobStatus>([
  "planned",
  "in_progress",
  "done",
  "cancelled",
]);

function clipStr(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

function finiteMs(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

/**
 * Validates backup JSON after `JSON.parse`. Throws `Error` with a short message on failure.
 */
export function assertValidPlannerSnapshot(data: unknown): PlannerSnapshot {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid backup file");
  }
  const o = data as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error("Invalid backup file");
  }
  if (!Array.isArray(o.jobs)) {
    throw new Error("Invalid backup file");
  }
  if (o.jobs.length > MAX_JOBS) {
    throw new Error(`Backup has too many jobs (max ${MAX_JOBS}).`);
  }

  const jobs: Job[] = o.jobs.map((item, i) => parseJobRecord(item, i));
  const workSettings = parseWorkSettingsRecord(o.workSettings);

  const rangeRaw =
    o.viewRangeStartMs ?? o.viewWeekStartMs ?? startOfWeekMonday(Date.now()).getTime();
  const viewRangeStartMs = finiteMs(rangeRaw);
  if (viewRangeStartMs === null) {
    throw new Error("Invalid backup file: bad calendar range.");
  }

  let viewMode: ViewMode = "week";
  if (o.viewMode === "month" || o.viewMode === "week") {
    viewMode = o.viewMode;
  }

  return {
    version: 1,
    jobs,
    workSettings,
    viewRangeStartMs,
    viewMode,
  };
}

function parseJobRecord(item: unknown, index: number): Job {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Invalid job at index ${index}`);
  }
  const j = item as Record<string, unknown>;

  const idRaw = j.id;
  if (typeof idRaw !== "string" || idRaw.length === 0) {
    throw new Error(`Invalid job at index ${index}: missing id`);
  }
  const id = clipStr(idRaw, MAX_ID_LEN);

  const titleRaw = j.title;
  const title =
    typeof titleRaw === "string"
      ? clipStr(titleRaw.trim(), MAX_TITLE_LEN) || "Untitled"
      : "Untitled";

  const dur = j.durationMinutes;
  if (typeof dur !== "number" || !Number.isFinite(dur) || dur < 0) {
    throw new Error(`Invalid job at index ${index}: bad duration`);
  }
  const durationMinutes = Math.min(Math.floor(dur), MAX_DURATION_MINUTES);

  const pr = j.priority;
  if (typeof pr !== "number" || !Number.isInteger(pr) || !PRIORITIES.has(pr as Priority)) {
    throw new Error(`Invalid job at index ${index}: bad priority`);
  }
  const priority = pr as Priority;

  let anchorStartMs: number | null = null;
  if (j.anchorStartMs != null) {
    const a = finiteMs(j.anchorStartMs);
    if (a === null) {
      throw new Error(`Invalid job at index ${index}: bad anchor time`);
    }
    anchorStartMs = a;
  }

  const st = j.status;
  if (typeof st !== "string" || !STATUSES.has(st as JobStatus)) {
    throw new Error(`Invalid job at index ${index}: bad status`);
  }
  const status = st as JobStatus;

  let notes: string | undefined;
  if (j.notes != null) {
    if (typeof j.notes !== "string") {
      throw new Error(`Invalid job at index ${index}: notes must be a string`);
    }
    const n = j.notes.trim();
    notes = n === "" ? undefined : clipStr(n, MAX_NOTES_LEN);
  }

  let deadlineMs: number | undefined;
  if (j.deadlineMs != null) {
    const d = finiteMs(j.deadlineMs);
    if (d === null) {
      throw new Error(`Invalid job at index ${index}: bad deadline`);
    }
    deadlineMs = d;
  }

  let progressMinutesConsumed: number | undefined;
  if (j.progressMinutesConsumed != null) {
    const p = j.progressMinutesConsumed;
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0) {
      throw new Error(`Invalid job at index ${index}: bad progress`);
    }
    progressMinutesConsumed = Math.min(p, MAX_DURATION_MINUTES);
  }

  let actualEndMs: number | undefined;
  if (j.actualEndMs != null) {
    const e = finiteMs(j.actualEndMs);
    if (e === null) {
      throw new Error(`Invalid job at index ${index}: bad actual end time`);
    }
    actualEndMs = e;
  }

  let addedAtMs: number | undefined;
  if (j.addedAtMs != null) {
    const ad = finiteMs(j.addedAtMs);
    if (ad === null) {
      throw new Error(`Invalid job at index ${index}: bad added time`);
    }
    addedAtMs = ad;
  }

  return {
    id,
    title,
    durationMinutes,
    priority,
    anchorStartMs,
    status,
    notes,
    deadlineMs,
    progressMinutesConsumed,
    actualEndMs,
    addedAtMs,
  };
}

function parseWorkSettingsRecord(raw: unknown): WorkSettings {
  const d = defaultWorkSettings();
  if (raw === null || raw === undefined) {
    return d;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return d;
  }
  const w = raw as Record<string, unknown>;

  let workStartMinutes = d.workStartMinutes;
  const ws = w.workStartMinutes;
  if (typeof ws === "number" && Number.isFinite(ws)) {
    workStartMinutes = Math.max(0, Math.min(24 * 60 - 1, Math.floor(ws)));
  }

  let workEndMinutes = d.workEndMinutes;
  const we = w.workEndMinutes;
  if (typeof we === "number" && Number.isFinite(we)) {
    workEndMinutes = Math.max(1, Math.min(24 * 60, Math.floor(we)));
  }

  if (workEndMinutes <= workStartMinutes) {
    workEndMinutes = Math.min(24 * 60, workStartMinutes + 60);
  }

  let workDays = [...d.workDays] as WorkSettings["workDays"];
  const wd = w.workDays;
  if (Array.isArray(wd) && wd.length === 7) {
    workDays = wd.map((b) => b === true) as WorkSettings["workDays"];
  }

  return { workStartMinutes, workEndMinutes, workDays };
}

/**
 * Best-effort repair of persisted state (localStorage) so a bad or legacy blob does not brick the app.
 */
export function sanitizePersistedPlannerSlice(input: unknown): {
  jobs: Job[];
  workSettings: WorkSettings;
  viewRangeStartMs: number;
  viewMode: ViewMode;
} {
  const fallbackRange = startOfWeekMonday(Date.now()).getTime();
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      jobs: [],
      workSettings: defaultWorkSettings(),
      viewRangeStartMs: fallbackRange,
      viewMode: "week",
    };
  }
  const o = input as Record<string, unknown>;

  const workSettings = parseWorkSettingsRecord(o.workSettings);

  const viewRangeStartMs =
    finiteMs(o.viewRangeStartMs ?? o.viewWeekStartMs) ?? fallbackRange;

  let viewMode: ViewMode = o.viewMode === "month" ? "month" : "week";

  let jobs: Job[] = [];
  if (Array.isArray(o.jobs)) {
    jobs = o.jobs
      .slice(0, MAX_JOBS)
      .map((item, i) => softParseJob(item, i))
      .filter((j): j is Job => j != null);
  }

  return { jobs, workSettings, viewRangeStartMs, viewMode };
}

function softParseJob(item: unknown, index: number): Job | null {
  try {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const j = item as Record<string, unknown>;
    const idRaw = j.id;
    const id =
      typeof idRaw === "string" && idRaw.length > 0
        ? clipStr(idRaw, MAX_ID_LEN)
        : `recovered-${index}-${crypto.randomUUID()}`;

    const titleRaw = j.title;
    const title =
      typeof titleRaw === "string"
        ? clipStr(titleRaw.trim(), MAX_TITLE_LEN) || "Untitled"
        : "Untitled";

    let durationMinutes = 60;
    const dur = j.durationMinutes;
    if (typeof dur === "number" && Number.isFinite(dur) && dur >= 0) {
      durationMinutes = Math.min(Math.floor(dur), MAX_DURATION_MINUTES);
    }

    let priority: Priority = 1;
    const pr = j.priority;
    if (typeof pr === "number" && Number.isInteger(pr) && PRIORITIES.has(pr as Priority)) {
      priority = pr as Priority;
    }

    let anchorStartMs: number | null = null;
    if (j.anchorStartMs != null) {
      const a = finiteMs(j.anchorStartMs);
      if (a !== null) anchorStartMs = a;
    }

    let status: JobStatus = "planned";
    const st = j.status;
    if (typeof st === "string" && STATUSES.has(st as JobStatus)) {
      status = st as JobStatus;
    }

    let notes: string | undefined;
    if (typeof j.notes === "string") {
      const n = j.notes.trim();
      notes = n === "" ? undefined : clipStr(n, MAX_NOTES_LEN);
    }

    let deadlineMs: number | undefined;
    if (j.deadlineMs != null) {
      const d = finiteMs(j.deadlineMs);
      if (d !== null) deadlineMs = d;
    }

    let progressMinutesConsumed: number | undefined;
    const p = j.progressMinutesConsumed;
    if (typeof p === "number" && Number.isFinite(p) && p >= 0) {
      progressMinutesConsumed = Math.min(p, MAX_DURATION_MINUTES);
    }

    let actualEndMs: number | undefined;
    if (j.actualEndMs != null) {
      const e = finiteMs(j.actualEndMs);
      if (e !== null) actualEndMs = e;
    }

    let addedAtMs: number | undefined;
    if (j.addedAtMs != null) {
      const ad = finiteMs(j.addedAtMs);
      if (ad !== null) addedAtMs = ad;
    }

    return {
      id,
      title,
      durationMinutes,
      priority,
      anchorStartMs,
      status,
      notes,
      deadlineMs,
      progressMinutesConsumed,
      actualEndMs,
      addedAtMs,
    };
  } catch {
    return null;
  }
}
