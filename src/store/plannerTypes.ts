import type { Job, WorkSettings } from "@/scheduler/types";

export type ViewMode = "week" | "month";

export interface PlannerSnapshot {
  version: 1;
  jobs: Job[];
  workSettings: WorkSettings;
  /** Legacy: Monday 00:00; prefer viewRangeStartMs in new exports */
  viewWeekStartMs?: number;
  viewRangeStartMs?: number;
  viewMode?: ViewMode;
}
