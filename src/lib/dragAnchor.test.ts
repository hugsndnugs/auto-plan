import { describe, expect, it } from "vitest";
import {
  anchorAfterSegmentMove,
  monthDropStartMs,
  segmentDragKey,
} from "./dragAnchor";
import type { JobPlacement } from "@/scheduler/types";
import { defaultWorkSettings } from "@/scheduler/workWindows";

const SNAP = 15 * 60 * 1000;

describe("segmentDragKey", () => {
  it("is stable per job and segment start", () => {
    expect(segmentDragKey("a", 1)).toBe("a-1");
    expect(segmentDragKey("a", 1)).toBe(segmentDragKey("a", 1));
  });
});

describe("anchorAfterSegmentMove", () => {
  it("shifts first-segment anchor by delta (later drop)", () => {
    const t0 = 100 * SNAP;
    const placements: JobPlacement[] = [
      {
        jobId: "j",
        segments: [{ jobId: "j", startMs: t0, endMs: t0 + SNAP }],
        overflow: false,
        scheduledEndMs: t0 + SNAP,
      },
    ];
    const drop = t0 + 4 * SNAP;
    const anchor = anchorAfterSegmentMove(placements, "j", t0, drop);
    expect(anchor).toBe(t0 + 4 * SNAP);
  });

  it("shifts first-segment anchor by delta (earlier drop)", () => {
    const t0 = 200 * SNAP;
    const tDrop = 100 * SNAP;
    const placements: JobPlacement[] = [
      {
        jobId: "j",
        segments: [{ jobId: "j", startMs: t0, endMs: t0 + SNAP }],
        overflow: false,
        scheduledEndMs: t0 + SNAP,
      },
    ];
    const anchor = anchorAfterSegmentMove(placements, "j", t0, tDrop);
    expect(anchor).toBe(tDrop);
  });

  it("uses dragged segment start when moving a non-first segment", () => {
    const a = 100 * SNAP;
    const b = 105 * SNAP;
    const drop = 108 * SNAP;
    const placements: JobPlacement[] = [
      {
        jobId: "j",
        segments: [
          { jobId: "j", startMs: a, endMs: a + SNAP },
          { jobId: "j", startMs: b, endMs: b + SNAP },
        ],
        overflow: false,
        scheduledEndMs: b + SNAP,
      },
    ];
    const anchor = anchorAfterSegmentMove(placements, "j", b, drop);
    expect(anchor).toBe(a + (drop - b));
  });

  it("snaps result to 15-minute grid", () => {
    const SNAP = 15 * 60 * 1000;
    const base =
      Math.round(1_700_000_000_000 / SNAP) * SNAP;
    const placements: JobPlacement[] = [
      {
        jobId: "j",
        segments: [{ jobId: "j", startMs: base, endMs: base + SNAP }],
        overflow: false,
        scheduledEndMs: base + SNAP,
      },
    ];
    const anchor = anchorAfterSegmentMove(
      placements,
      "j",
      base,
      base + 123_456,
    );
    expect(anchor! % SNAP).toBe(0);
  });
});

describe("monthDropStartMs", () => {
  const settings = defaultWorkSettings();

  it("preserves local clock time on the target weekday", () => {
    const mon = new Date(2026, 3, 6, 10, 30, 0, 0);
    const wed = new Date(2026, 3, 8, 0, 0, 0, 0);
    const drop = monthDropStartMs(mon.getTime(), wed.getTime(), settings);
    const want = new Date(2026, 3, 8, 10, 30, 0, 0).getTime();
    expect(drop).toBe(want);
  });

  it("clamps to the last quarter-hour that can start before work end", () => {
    const mon = new Date(2026, 3, 6, 16, 59, 0, 0);
    const tue = new Date(2026, 3, 7, 0, 0, 0, 0);
    const lastStart = new Date(2026, 3, 7, 16, 45, 0, 0).getTime();
    expect(monthDropStartMs(mon.getTime(), tue.getTime(), settings)).toBe(
      lastStart,
    );
  });

  it("returns null on a non-working target day", () => {
    const fri = new Date(2026, 3, 10, 10, 0, 0, 0);
    const sat = new Date(2026, 3, 11, 0, 0, 0, 0);
    expect(monthDropStartMs(fri.getTime(), sat.getTime(), settings)).toBeNull();
  });

  it("snaps to 15-minute grid", () => {
    const mon = new Date(2026, 3, 6, 9, 7, 13, 0);
    const tue = new Date(2026, 3, 7, 0, 0, 0, 0);
    const drop = monthDropStartMs(mon.getTime(), tue.getTime(), settings);
    expect(drop! % SNAP).toBe(0);
    expect(drop).toBe(new Date(2026, 3, 7, 9, 0, 0, 0).getTime());
  });
});
