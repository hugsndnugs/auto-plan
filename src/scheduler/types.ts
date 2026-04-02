/** 0 = low … 3 = urgent */
export type Priority = 0 | 1 | 2 | 3;

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: "Low",
  1: "Normal",
  2: "High",
  3: "Urgent",
};

/** Priorities offered in add-job UI; scheduler still supports full `Priority` range (e.g. imports). */
export const UI_SELECTABLE_PRIORITIES = [1, 3] as const satisfies readonly Priority[];

/** Dropdown options when editing: Normal + Urgent, plus current value if it is High/Low (legacy/import). */
export function priorityOptionsForEditor(currentPriority: Priority): Priority[] {
  const set = new Set<Priority>([...UI_SELECTABLE_PRIORITIES, currentPriority]);
  return Array.from(set).sort((a, b) => a - b);
}

export interface WorkSettings {
  /** Minutes from local midnight (e.g. 480 = 08:00) */
  workStartMinutes: number;
  workEndMinutes: number;
  /** [Sun, Mon, … Sat] */
  workDays: [
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
  ];
}

export type JobStatus = "planned" | "in_progress" | "done" | "cancelled";

export interface Job {
  id: string;
  title: string;
  durationMinutes: number;
  priority: Priority;
  /** Requested first-segment start, or null for auto placement */
  anchorStartMs: number | null;
  status: JobStatus;
  notes?: string;
  deadlineMs?: number;
  /** For `in_progress`: minutes already consumed toward duration */
  progressMinutesConsumed?: number;
  /** When marked done (incl. early finish) */
  actualEndMs?: number;
  /** Creation time; used for High auto-deferral (14 days after add). */
  addedAtMs?: number;
}

export interface Segment {
  jobId: string;
  startMs: number;
  endMs: number;
}

export interface JobPlacement {
  jobId: string;
  segments: Segment[];
  overflow: boolean;
  /** End of last segment; null if overflow with no segments */
  scheduledEndMs: number | null;
  /**
   * Urgent: first segment later than ~1 day from now. High: later than addedAt + 14d + grace.
   */
  slip?: "urgent" | "high";
}

export interface PackResult {
  placements: JobPlacement[];
  /** Segments flattened in pack order */
  allSegments: Segment[];
}
