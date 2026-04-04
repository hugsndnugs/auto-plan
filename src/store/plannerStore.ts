import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Job, WorkSettings } from "@/scheduler/types";
import {
  addMonthsLocal,
  startOfMonthLocal,
  startOfWeekMonday,
} from "@/lib/dates";
import {
  assertValidPlannerSnapshot,
  MAX_BACKUP_JSON_CHARS,
  sanitizePersistedPlannerSlice,
} from "@/lib/snapshotValidation";
import { createSafeLocalStorage } from "@/lib/persistStorage";
import { defaultWorkSettings } from "@/scheduler/workWindows";
import type { PlannerSnapshot, ViewMode } from "./plannerTypes";

export type { ViewMode, PlannerSnapshot } from "./plannerTypes";

export interface PlannerState {
  jobs: Job[];
  workSettings: WorkSettings;
  /**
   * Week mode: Monday 00:00 local of visible week.
   * Month mode: 1st of month 00:00 local for visible month.
   */
  viewRangeStartMs: number;
  viewMode: ViewMode;
  addJob: (partial: Omit<Job, "id">) => void;
  updateJob: (id: string, patch: Partial<Job>) => void;
  deleteJob: (id: string) => void;
  setWorkSettings: (s: WorkSettings) => void;
  setViewRangeStartMs: (ms: number) => void;
  setViewMode: (mode: ViewMode) => void;
  shiftCalendar: (delta: number) => void;
  exportSnapshot: () => string;
  importSnapshot: (json: string) => void;
}

function newId(): string {
  return crypto.randomUUID();
}

const emptyJobs: Job[] = [];

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set, get) => ({
      jobs: emptyJobs,
      workSettings: defaultWorkSettings(),
      viewRangeStartMs: startOfWeekMonday(Date.now()).getTime(),
      viewMode: "week" as ViewMode,

      addJob: (partial) => {
        const job: Job = {
          id: newId(),
          title: partial.title?.trim() || "Untitled",
          durationMinutes: partial.durationMinutes,
          priority: partial.priority ?? 1,
          anchorStartMs: partial.anchorStartMs ?? null,
          status: partial.status ?? "planned",
          notes: partial.notes,
          deadlineMs: partial.deadlineMs,
          progressMinutesConsumed: partial.progressMinutesConsumed,
          actualEndMs: partial.actualEndMs,
          addedAtMs: partial.addedAtMs ?? Date.now(),
        };
        set({ jobs: [...get().jobs, job] });
      },

      updateJob: (id, patch) => {
        set({
          jobs: get().jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
        });
      },

      deleteJob: (id) => {
        set({ jobs: get().jobs.filter((j) => j.id !== id) });
      },

      setWorkSettings: (workSettings) => set({ workSettings }),

      setViewRangeStartMs: (viewRangeStartMs) => set({ viewRangeStartMs }),

      setViewMode: (mode) => {
        const ms = get().viewRangeStartMs;
        if (mode === "week") {
          set({
            viewMode: "week",
            viewRangeStartMs: startOfWeekMonday(ms).getTime(),
          });
        } else {
          set({
            viewMode: "month",
            viewRangeStartMs: startOfMonthLocal(ms),
          });
        }
      },

      shiftCalendar: (delta) => {
        const { viewMode, viewRangeStartMs } = get();
        if (viewMode === "week") {
          const d = new Date(viewRangeStartMs);
          d.setDate(d.getDate() + delta * 7);
          set({ viewRangeStartMs: d.getTime() });
        } else {
          set({ viewRangeStartMs: addMonthsLocal(viewRangeStartMs, delta) });
        }
      },

      exportSnapshot: () => {
        const s = get();
        const snap: PlannerSnapshot = {
          version: 1,
          jobs: s.jobs,
          workSettings: s.workSettings,
          viewRangeStartMs: s.viewRangeStartMs,
          viewMode: s.viewMode,
        };
        return JSON.stringify(snap, null, 2);
      },

      importSnapshot: (json) => {
        if (json.length > MAX_BACKUP_JSON_CHARS) {
          throw new Error(
            `Backup file is too large (max ${MAX_BACKUP_JSON_CHARS} characters).`,
          );
        }
        let data: unknown;
        try {
          data = JSON.parse(json);
        } catch {
          throw new Error("Invalid backup file");
        }
        const snap = assertValidPlannerSnapshot(data);
        set({
          jobs: snap.jobs,
          workSettings: snap.workSettings,
          viewRangeStartMs: snap.viewRangeStartMs,
          viewMode: snap.viewMode,
        });
      },
    }),
    {
      name: "auto-plan-storage",
      /** Re-run migrate for existing v3 stores so persisted data is sanitized once. */
      version: 4,
      storage: createJSONStorage(() => createSafeLocalStorage()),
      migrate: (persisted, version) => {
        if (persisted == null || typeof persisted !== "object") {
          return persisted as PlannerState;
        }
        let p = persisted as Record<string, unknown>;

        if (version < 2) {
          const vw = p.viewWeekStartMs ?? p.viewRangeStartMs;
          const range =
            typeof vw === "number" && Number.isFinite(vw)
              ? vw
              : startOfWeekMonday(Date.now()).getTime();
          p = {
            ...p,
            viewRangeStartMs: range,
            viewMode: (p.viewMode as ViewMode) ?? "week",
          };
        }

        if (version < 3) {
          const jobs = Array.isArray(p.jobs)
            ? (p.jobs as Job[]).map((j) =>
                j.addedAtMs == null ? { ...j, addedAtMs: Date.now() } : j,
              )
            : [];
          p = { ...p, jobs };
        }

        const safe = sanitizePersistedPlannerSlice(p);
        return {
          ...p,
          jobs: safe.jobs,
          workSettings: safe.workSettings,
          viewRangeStartMs: safe.viewRangeStartMs,
          viewMode: safe.viewMode,
        } as unknown as PlannerState;
      },
      partialize: (s) => ({
        jobs: s.jobs,
        workSettings: s.workSettings,
        viewRangeStartMs: s.viewRangeStartMs,
        viewMode: s.viewMode,
      }),
    },
  ),
);
