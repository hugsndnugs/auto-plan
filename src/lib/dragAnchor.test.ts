import { describe, expect, it } from "vitest";
import { anchorAfterSegmentMove, segmentDragKey } from "./dragAnchor";
import type { JobPlacement } from "@/scheduler/types";

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
