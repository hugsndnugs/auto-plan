import type { CSSProperties, DragEvent } from "react";
import { useCallback, useState } from "react";
import type { Job, Segment, WorkSettings } from "@/scheduler/types";
import { getDayWorkBounds } from "@/scheduler/workWindows";
import { formatDayLabel, formatTime } from "@/lib/dates";
import { priorityStyle } from "@/lib/priorityColor";
import {
  DRAG_MIME,
  segmentDragKey,
  setSegmentDragPayload,
  timeAtTrackY,
} from "@/lib/dragAnchor";

export interface WeekGridProps {
  weekStartMs: number;
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

export function WeekGrid({
  weekStartMs,
  segments,
  jobsById,
  workSettings,
  onSelectJob,
  onMoveJob,
}: WeekGridProps) {
  const days = Array.from({ length: 7 }, (_, i) => weekStartMs + i * 86400000);

  const [dropHighlightDay, setDropHighlightDay] = useState<number | null>(null);
  const [draggingSegKey, setDraggingSegKey] = useState<string | null>(null);

  const resetDragUi = useCallback(() => {
    setDropHighlightDay(null);
    setDraggingSegKey(null);
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
      setDraggingSegKey(segmentDragKey(seg.jobId, seg.startMs));
    },
    [canDragJob],
  );

  const onColumnDragOver = useCallback(
    (e: DragEvent, dayStartMs: number, isWork: boolean) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      if (!isWork || !types.includes(DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropHighlightDay(dayStartMs);
    },
    [],
  );

  const onColumnDrop = useCallback(
    (e: DragEvent, dayStartMs: number, isWork: boolean) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = e.dataTransfer.getData(DRAG_MIME);
      resetDragUi();
      if (!isWork || !raw) return;
      let parsed: { jobId: string; segmentStartMs: number };
      try {
        parsed = JSON.parse(raw) as { jobId: string; segmentStartMs: number };
      } catch {
        return;
      }
      if (!parsed.jobId || typeof parsed.segmentStartMs !== "number") return;

      const trackEl = (e.target as HTMLElement).closest(".day-col__track");
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
    [workSettings, onMoveJob, resetDragUi],
  );

  return (
    <div className="week-grid">
      {days.map((dayStartMs) => {
        const wd = new Date(dayStartMs).getDay();
        const isWork = workSettings.workDays[wd];
        const daySegs = segments.filter(
          (s) => s.endMs > dayStartMs && s.startMs < dayStartMs + 86400000,
        );

        return (
          <div
            key={dayStartMs}
            className={`day-col ${!isWork ? "day-col--off" : ""}`}
          >
            <div className="day-col__head">
              <span className="day-col__dow">{formatDayLabel(dayStartMs)}</span>
            </div>
            <div
              className="day-col__body"
              style={
                {
                  "--work-start": workSettings.workStartMinutes,
                  "--work-end": workSettings.workEndMinutes,
                } as CSSProperties
              }
            >
              <div className="day-col__ticks" aria-hidden>
                <span>Start</span>
                <span>End</span>
              </div>
              <div
                className={`day-col__track${dropHighlightDay === dayStartMs ? " day-col__track--drophover" : ""}`}
                onDragOver={(e) => onColumnDragOver(e, dayStartMs, isWork)}
                onDragLeave={(ev) => {
                  if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
                    setDropHighlightDay(null);
                  }
                }}
                onDrop={(e) => onColumnDrop(e, dayStartMs, isWork)}
              >
                {isWork ? (
                  daySegs.map((seg) => {
                    const bounds = getDayWorkBounds(dayStartMs, workSettings);
                    if (!bounds) return null;
                    const clipStart = Math.max(seg.startMs, bounds.startMs);
                    const clipEnd = Math.min(seg.endMs, bounds.endMs);
                    if (clipEnd <= clipStart) return null;
                    const total = bounds.endMs - bounds.startMs;
                    const top = ((clipStart - bounds.startMs) / total) * 100;
                    const height = ((clipEnd - clipStart) / total) * 100;
                    const job = jobsById.get(seg.jobId);
                    const pri = job?.priority ?? 1;
                    const drag = canDragJob(seg.jobId);
                    const dKey = segmentDragKey(seg.jobId, seg.startMs);
                    const isDraggingThisSeg = draggingSegKey === dKey;

                    return (
                      <div
                        key={`${seg.jobId}-${seg.startMs}-${dayStartMs}`}
                        className={`seg${drag ? " seg--draggable" : ""}${isDraggingThisSeg ? " seg--dragging-source" : ""}`}
                        draggable={drag}
                        onDragStart={(e) => {
                          if (drag) onSegDragStart(e, seg);
                        }}
                        onDragEnd={resetDragUi}
                        style={{
                          top: `${top}%`,
                          height: `${Math.max(height, 8)}%`,
                          ...priorityStyle(pri),
                        }}
                        title={`${job?.title ?? seg.jobId} · ${formatTime(clipStart)}–${formatTime(clipEnd)}${drag ? " — drag to reschedule" : ""}`}
                        onDragOver={(e) => onColumnDragOver(e, dayStartMs, isWork)}
                      >
                        <button
                          type="button"
                          className="seg__body"
                          onClick={() => onSelectJob(seg.jobId)}
                        >
                          <span className="seg__title">{job?.title ?? "Job"}</span>
                          <span className="seg__time">
                            {formatTime(clipStart)} – {formatTime(clipEnd)}
                          </span>
                        </button>
                      </div>
                    );
                  })
                ) : (
                  daySegs.length > 0 && (
                    <div className="day-col__off-label">
                      Non-working day
                    </div>
                  )
                )}
                {!isWork && daySegs.length === 0 && (
                  <div className="day-col__off-label">Off</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
