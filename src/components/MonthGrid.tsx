import type { DragEvent } from "react";
import { useCallback, useState } from "react";
import type { Job, Segment, WorkSettings } from "@/scheduler/types";
import { buildMonthGrid } from "@/lib/dates";
import { priorityStyle } from "@/lib/priorityColor";
import {
  DRAG_MIME,
  setSegmentDragPayload,
  timeAtTrackY,
} from "@/lib/dragAnchor";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface MonthGridProps {
  monthStartMs: number;
  segments: Segment[];
  jobsById: Map<string, Job>;
  workSettings: WorkSettings;
  onSelectJob: (jobId: string) => void;
  onMoveJob: (args: {
    jobId: string;
    draggedSegmentStartMs: number;
    dropStartMs: number;
  }) => void;
}

export function MonthGrid({
  monthStartMs,
  segments,
  jobsById,
  workSettings,
  onSelectJob,
  onMoveJob,
}: MonthGridProps) {
  const cells = buildMonthGrid(monthStartMs);

  const [dropHighlightDay, setDropHighlightDay] = useState<number | null>(null);

  const clearDropHighlight = useCallback(() => {
    setDropHighlightDay(null);
  }, []);

  const canDragJob = useCallback(
    (jobId: string) => {
      const j = jobsById.get(jobId);
      if (!j) return false;
      return j.status === "planned" || j.status === "in_progress";
    },
    [jobsById],
  );

  const onSegDragStart = useCallback(
    (e: DragEvent, seg: Segment) => {
      if (!canDragJob(seg.jobId)) return;
      setSegmentDragPayload(e, {
        jobId: seg.jobId,
        segmentStartMs: seg.startMs,
      });
    },
    [canDragJob],
  );

  const onCellDragOver = useCallback(
    (e: DragEvent, dayStartMs: number, isWork: boolean) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (!isWork || !types.includes(DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropHighlightDay(dayStartMs);
    },
    [],
  );

  const onCellDrop = useCallback(
    (e: DragEvent, dayStartMs: number, isWork: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = e.dataTransfer.getData(DRAG_MIME);
      clearDropHighlight();
      if (!isWork || !raw) return;
      let parsed: { jobId: string; segmentStartMs: number };
      try {
        parsed = JSON.parse(raw) as { jobId: string; segmentStartMs: number };
      } catch {
        return;
      }
      if (!parsed.jobId || typeof parsed.segmentStartMs !== "number") return;

      const trackEl = (e.target as HTMLElement).closest(".month-grid__drop-track");
      if (!trackEl) return;
      const rect = trackEl.getBoundingClientRect();
      const dropStartMs = timeAtTrackY(
        e.clientY,
        rect,
        dayStartMs,
        workSettings,
      );
      if (dropStartMs === null) return;

      onMoveJob({
        jobId: parsed.jobId,
        draggedSegmentStartMs: parsed.segmentStartMs,
        dropStartMs,
      });
    },
    [workSettings, onMoveJob, clearDropHighlight],
  );

  return (
    <div className="month-grid">
      <div className="month-grid__head">
        {WEEKDAYS.map((d) => (
          <div key={d} className="month-grid__dow">
            {d}
          </div>
        ))}
      </div>
      <div className="month-grid__cells">
        {cells.map(({ dayStartMs, inCurrentMonth }) => {
          const dayEnd = dayStartMs + 86400000;
          const daySegs = segments.filter(
            (s) => s.endMs > dayStartMs && s.startMs < dayEnd,
          );
          const isWork =
            workSettings.workDays[new Date(dayStartMs).getDay()];

          const uniqueFirstSeg = new Map<string, Segment>();
          for (const s of daySegs) {
            if (!uniqueFirstSeg.has(s.jobId)) uniqueFirstSeg.set(s.jobId, s);
          }

          return (
            <div
              key={dayStartMs}
              className={`month-grid__cell${!inCurrentMonth ? " month-grid__cell--muted" : ""}${!isWork ? " month-grid__cell--off" : ""}`}
            >
              <div className="month-grid__daynum">
                {new Date(dayStartMs).getDate()}
              </div>
              <div
                className={`month-grid__chips month-grid__drop-track${dropHighlightDay === dayStartMs ? " month-grid__drop-track--hover" : ""}`}
                onDragOver={(ev) => onCellDragOver(ev, dayStartMs, isWork)}
                onDragLeave={(ev) => {
                  if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
                    setDropHighlightDay(null);
                  }
                }}
                onDrop={(ev) => onCellDrop(ev, dayStartMs, isWork)}
              >
                {[...uniqueFirstSeg.values()].map((seg) => {
                  const job = jobsById.get(seg.jobId);
                  const pri = job?.priority ?? 1;
                  const drag = canDragJob(seg.jobId);
                  return (
                    <div
                      key={`${seg.jobId}-${dayStartMs}`}
                      className={`month-grid__chip-row${drag ? " month-grid__chip-row--draggable" : ""}`}
                      draggable={drag}
                      onDragStart={(ev) => {
                        if (drag) onSegDragStart(ev, seg);
                      }}
                      onDragEnd={clearDropHighlight}
                      onDragOver={(ev) => onCellDragOver(ev, dayStartMs, isWork)}
                    >
                      <button
                        type="button"
                        className="month-grid__chip"
                        style={priorityStyle(pri)}
                        title={
                          drag
                            ? `${job?.title ?? seg.jobId} — drag to reschedule`
                            : (job?.title ?? seg.jobId)
                        }
                        onClick={() => onSelectJob(seg.jobId)}
                      >
                        <span className="month-grid__chip-text">
                          {job?.title ?? "Job"}
                        </span>
                      </button>
                    </div>
                  );
                })}
                {isWork && uniqueFirstSeg.size === 0 && (
                  <div className="month-grid__drop-empty" aria-hidden>
                    Drop here
                  </div>
                )}
                {!isWork && uniqueFirstSeg.size > 0 && (
                  <div className="month-grid__off-note">Non-working day</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="month-grid__hint">
        Drag a job block onto another day — vertical position in the cell sets
        the time of day (same as week view).
      </p>
    </div>
  );
}
