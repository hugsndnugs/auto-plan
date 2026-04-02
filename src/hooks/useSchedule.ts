import { useEffect, useMemo, useState } from "react";
import { packJobs } from "@/scheduler/pack";
import type { Job, PackResult, WorkSettings } from "@/scheduler/types";
import type { ViewMode } from "@/store/plannerStore";
import { addMonthsLocal, startOfNextMonthLocal } from "@/lib/dates";

const SCHEDULE_HORIZON_MONTHS = 6;

export function useSchedule(
  jobs: Job[],
  settings: WorkSettings,
  viewRangeStartMs: number,
  viewMode: ViewMode,
): PackResult {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const visibleRangeEnd =
      viewMode === "week"
        ? viewRangeStartMs + 7 * 86400000
        : startOfNextMonthLocal(viewRangeStartMs);
    const sixMonthsOut = addMonthsLocal(nowMs, SCHEDULE_HORIZON_MONTHS);
    const horizonEndMs = Math.max(visibleRangeEnd, sixMonthsOut);
    const horizonStartMs = Math.min(viewRangeStartMs, nowMs);
    return packJobs(jobs, {
      settings,
      horizonStartMs,
      horizonEndMs,
      nowMs,
    });
  }, [jobs, settings, viewRangeStartMs, viewMode, nowMs]);
}
