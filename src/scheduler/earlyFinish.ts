import type { Job, PackResult } from "./types";
import { packJobs, type PackOptions } from "./pack";

/**
 * Marks a job finished at `actualEndMs` and re-packs remaining active jobs from that instant.
 * Caller should set `status: "done"` and `actualEndMs` on the job before passing the full list.
 */
export function repackAfterEarlyFinish(
  jobs: Job[],
  finishedJobId: string,
  actualEndMs: number,
  options: PackOptions,
): PackResult {
  const withDone = jobs.map((j) =>
    j.id === finishedJobId
      ? { ...j, status: "done" as const, actualEndMs }
      : j,
  );
  return packJobs(withDone, {
    ...options,
    horizonStartMs: Math.max(options.horizonStartMs, actualEndMs),
    nowMs: Math.max(options.nowMs, actualEndMs),
  });
}
