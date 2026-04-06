import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WeekGrid } from "@/components/WeekGrid";
import type { Job, Segment, WorkSettings } from "@/scheduler/types";

const workSettings: WorkSettings = {
  workStartMinutes: 8 * 60,
  workEndMinutes: 17 * 60,
  workDays: [false, true, true, true, true, true, false],
};

const weekStartMs = Date.UTC(2026, 3, 6); // Monday UTC

function renderGrid({
  touchMoveControls = true,
  onOpenSegmentMove = vi.fn(),
}: {
  touchMoveControls?: boolean;
  onOpenSegmentMove?: (args: { jobId: string; segmentStartMs: number }) => void;
} = {}) {
  const job: Job = {
    id: "job-1",
    title: "A long named mobile job",
    durationMinutes: 60,
    priority: 1,
    anchorStartMs: null,
    status: "planned",
  };
  const seg: Segment = {
    jobId: "job-1",
    startMs: weekStartMs + (8 * 60 + 30) * 60000,
    endMs: weekStartMs + (9 * 60 + 30) * 60000,
  };
  const renderResult = render(
    <WeekGrid
      weekStartMs={weekStartMs}
      segments={[seg]}
      jobsById={new Map([[job.id, job]])}
      workSettings={workSettings}
      onSelectJob={vi.fn()}
      onMoveJob={vi.fn()}
      touchMoveControls={touchMoveControls}
      onOpenSegmentMove={onOpenSegmentMove}
    />,
  );
  return { seg, onOpenSegmentMove, ...renderResult };
}

describe("WeekGrid mobile move affordance", () => {
  it("does not render a visible Move button in touch mode", () => {
    renderGrid();
    expect(
      screen.queryByRole("button", { name: /move .*another time/i }),
    ).not.toBeInTheDocument();
  });

  it("opens move flow on long press", () => {
    vi.useFakeTimers();
    const onOpenSegmentMove = vi.fn();
    const { seg, container } = renderGrid({ onOpenSegmentMove });
    const bodyBtn = container.querySelector(
      `.seg__body[data-testid="week-seg-body-job-1-${seg.startMs}"]`,
    ) as HTMLElement;

    fireEvent.mouseDown(bodyBtn, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(450);

    expect(onOpenSegmentMove).toHaveBeenCalledWith({
      jobId: "job-1",
      segmentStartMs: seg.startMs,
    });
    vi.useRealTimers();
  });

  it("does not open move flow on quick tap", () => {
    vi.useFakeTimers();
    const onOpenSegmentMove = vi.fn();
    const { seg, container } = renderGrid({ onOpenSegmentMove });
    const bodyBtn = container.querySelector(
      `.seg__body[data-testid="week-seg-body-job-1-${seg.startMs}"]`,
    ) as HTMLElement;

    fireEvent.mouseDown(bodyBtn, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(120);
    fireEvent.mouseUp(bodyBtn);
    vi.advanceTimersByTime(450);

    expect(onOpenSegmentMove).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("cancels long press when pointer moves too far", () => {
    vi.useFakeTimers();
    const onOpenSegmentMove = vi.fn();
    const { seg, container } = renderGrid({ onOpenSegmentMove });
    const bodyBtn = container.querySelector(
      `.seg__body[data-testid="week-seg-body-job-1-${seg.startMs}"]`,
    ) as HTMLElement;

    fireEvent.mouseDown(bodyBtn, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(bodyBtn, { clientX: 35, clientY: 35 });
    vi.advanceTimersByTime(450);

    expect(onOpenSegmentMove).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
