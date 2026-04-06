import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonthGrid } from "@/components/MonthGrid";
import type { Job, Segment, WorkSettings } from "@/scheduler/types";

const workSettings: WorkSettings = {
  workStartMinutes: 8 * 60,
  workEndMinutes: 17 * 60,
  workDays: [false, true, true, true, true, true, false],
};

const monthStartMs = Date.UTC(2026, 3, 1);

function renderGrid({
  touchMoveControls = true,
  onOpenSegmentMove = vi.fn(),
}: {
  touchMoveControls?: boolean;
  onOpenSegmentMove?: (args: { jobId: string; segmentStartMs: number }) => void;
} = {}) {
  const job: Job = {
    id: "job-1",
    title: "Long job title for month chip",
    durationMinutes: 60,
    priority: 1,
    anchorStartMs: null,
    status: "planned",
  };
  const seg: Segment = {
    jobId: "job-1",
    startMs: Date.UTC(2026, 3, 2, 9, 0),
    endMs: Date.UTC(2026, 3, 2, 10, 0),
  };
  const renderResult = render(
    <MonthGrid
      monthStartMs={monthStartMs}
      segments={[seg]}
      jobsById={new Map([[job.id, job]])}
      workSettings={workSettings}
      onSelectJob={vi.fn()}
      onMoveJob={vi.fn()}
      touchMoveControls={touchMoveControls}
      onOpenSegmentMove={onOpenSegmentMove}
    />,
  );
  return { seg, ...renderResult };
}

describe("MonthGrid mobile move affordance", () => {
  it("does not render a visible Move button in touch mode", () => {
    renderGrid();
    expect(screen.queryByRole("button", { name: /move /i })).not.toBeInTheDocument();
  });

  it("opens move flow on long press", () => {
    vi.useFakeTimers();
    const onOpenSegmentMove = vi.fn();
    const { seg, container } = renderGrid({ onOpenSegmentMove });
    const chip = container.querySelector(
      `.month-grid__chip[data-testid="month-chip-job-1-${seg.startMs}"]`,
    ) as HTMLElement;

    fireEvent.mouseDown(chip, { clientX: 12, clientY: 20 });
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
    const chip = container.querySelector(
      `.month-grid__chip[data-testid="month-chip-job-1-${seg.startMs}"]`,
    ) as HTMLElement;

    fireEvent.mouseDown(chip, { clientX: 8, clientY: 8 });
    vi.advanceTimersByTime(100);
    fireEvent.mouseUp(chip);
    vi.advanceTimersByTime(450);

    expect(onOpenSegmentMove).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("cancels long press when pointer moves too far", () => {
    vi.useFakeTimers();
    const onOpenSegmentMove = vi.fn();
    const { seg, container } = renderGrid({ onOpenSegmentMove });
    const chip = container.querySelector(
      `.month-grid__chip[data-testid="month-chip-job-1-${seg.startMs}"]`,
    ) as HTMLElement;

    fireEvent.mouseDown(chip, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(chip, { clientX: 40, clientY: 40 });
    vi.advanceTimersByTime(450);

    expect(onOpenSegmentMove).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
