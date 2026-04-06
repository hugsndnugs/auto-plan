import type { DragEvent, PointerEvent, TouchEvent } from "react";
import { useCallback, useRef, useState } from "react";
import type { Job, Segment, WorkSettings } from "@/scheduler/types";
import { startOfLocalDay } from "@/scheduler/workWindows";
import { buildMonthGrid } from "@/lib/dates";
import { priorityStyle } from "@/lib/priorityColor";
import {
  DRAG_MIME,
  monthDropStartMs,
  setSegmentDragPayload,
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
  touchMoveControls?: boolean;
  onOpenSegmentMove?: (args: { jobId: string; segmentStartMs: number }) => void;
}

export function MonthGrid({
  monthStartMs,
  segments,
  jobsById,
  workSettings,
  onSelectJob,
  onMoveJob,
  touchMoveControls = false,
  onOpenSegmentMove,
}: MonthGridProps) {
  const LONG_PRESS_MS = 400;
  const LONG_PRESS_CANCEL_PX = 10;
  const cells = buildMonthGrid(monthStartMs);

  const [dropHighlightDay, setDropHighlightDay] = useState<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextSelectRef = useRef(false);

  const clearDropHighlight = useCallback(() => {
    setDropHighlightDay(null);
  }, []);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      globalThis.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
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
      if (
        !parsed.jobId ||
        typeof parsed.segmentStartMs !== "number" ||
        !Number.isFinite(parsed.segmentStartMs)
      ) {
        return;
      }

      const dropStartMs = monthDropStartMs(
        parsed.segmentStartMs,
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

  const startLongPressMoveAt = useCallback(
    (x: number, y: number, seg: Segment, drag: boolean) => {
      if (!touchMoveControls || !drag || !onOpenSegmentMove) return;
      clearLongPress();
      longPressStartRef.current = { x, y };
      longPressTimerRef.current = globalThis.setTimeout(() => {
        suppressNextSelectRef.current = true;
        onOpenSegmentMove({
          jobId: seg.jobId,
          segmentStartMs: seg.startMs,
        });
        clearLongPress();
      }, LONG_PRESS_MS);
    },
    [clearLongPress, onOpenSegmentMove, touchMoveControls],
  );

  const continueLongPressMoveAt = useCallback(
    (x: number, y: number) => {
      const start = longPressStartRef.current;
      if (!start || longPressTimerRef.current === null) return;
      const dx = Math.abs(x - start.x);
      const dy = Math.abs(y - start.y);
      if (Math.hypot(dx, dy) > LONG_PRESS_CANCEL_PX) clearLongPress();
    },
    [clearLongPress],
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
          const normalizedDayStart = startOfLocalDay(dayStartMs).getTime();
          const dayEnd = normalizedDayStart + 86400000;
          const daySegs = segments.filter(
            (s) => s.endMs > normalizedDayStart && s.startMs < dayEnd,
          );
          const isWork =
            workSettings.workDays[new Date(normalizedDayStart).getDay()];

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
                {new Date(normalizedDayStart).getDate()}
              </div>
              <div
                className={`month-grid__chips month-grid__drop-track${dropHighlightDay === normalizedDayStart ? " month-grid__drop-track--hover" : ""}`}
                onDragOver={(ev) =>
                  onCellDragOver(ev, normalizedDayStart, isWork)
                }
                onDragLeave={(ev) => {
                  if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
                    setDropHighlightDay(null);
                  }
                }}
                onDrop={(ev) => onCellDrop(ev, normalizedDayStart, isWork)}
              >
                {[...uniqueFirstSeg.values()].map((seg) => {
                  const job = jobsById.get(seg.jobId);
                  const pri = job?.priority ?? 1;
                  const drag = canDragJob(seg.jobId);
                  return (
                    <div
                      key={`${seg.jobId}-${normalizedDayStart}`}
                      className={`month-grid__chip-row${drag ? " month-grid__chip-row--draggable" : ""}`}
                      draggable={drag}
                      onDragStart={(ev) => {
                        if (drag) onSegDragStart(ev, seg);
                      }}
                      onDragEnd={clearDropHighlight}
                      onDragOver={(ev) =>
                        onCellDragOver(ev, normalizedDayStart, isWork)
                      }
                    >
                      <button
                        type="button"
                        className="month-grid__chip"
                        data-testid={`month-chip-${seg.jobId}-${seg.startMs}`}
                        style={priorityStyle(pri)}
                        title={
                          drag
                            ? `${job?.title ?? seg.jobId} — drag or long-press to reschedule`
                            : (job?.title ?? seg.jobId)
                        }
                        onClick={(e) => {
                          if (suppressNextSelectRef.current) {
                            suppressNextSelectRef.current = false;
                            e.preventDefault();
                            return;
                          }
                          onSelectJob(seg.jobId);
                        }}
                        onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
                          startLongPressMoveAt(e.clientX, e.clientY, seg, drag);
                        }}
                        onPointerMove={(e: PointerEvent<HTMLButtonElement>) => {
                          continueLongPressMoveAt(e.clientX, e.clientY);
                        }}
                        onPointerUp={clearLongPress}
                        onPointerCancel={clearLongPress}
                        onTouchStart={(e: TouchEvent<HTMLButtonElement>) => {
                          const t = e.touches[0];
                          if (!t) return;
                          startLongPressMoveAt(t.clientX, t.clientY, seg, drag);
                        }}
                        onTouchMove={(e: TouchEvent<HTMLButtonElement>) => {
                          const t = e.touches[0];
                          if (!t) return;
                          continueLongPressMoveAt(t.clientX, t.clientY);
                        }}
                        onTouchEnd={clearLongPress}
                        onTouchCancel={clearLongPress}
                        onMouseDown={(e) => {
                          startLongPressMoveAt(e.clientX, e.clientY, seg, drag);
                        }}
                        onMouseMove={(e) => {
                          continueLongPressMoveAt(e.clientX, e.clientY);
                        }}
                        onMouseUp={clearLongPress}
                        onMouseLeave={clearLongPress}
                        onContextMenu={(e) => {
                          if (touchMoveControls && drag) e.preventDefault();
                        }}
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
        {touchMoveControls
          ? "Long-press a job to move it, or drag on a device that supports it. The target day keeps the job’s clock time (week view still uses vertical position for time)."
          : "Drag a job chip onto another day — the target day keeps the same clock time as before the move (week view still uses vertical position for time)."}
      </p>
    </div>
  );
}
