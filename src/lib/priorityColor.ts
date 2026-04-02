import type { CSSProperties } from "react";
import type { Priority } from "@/scheduler/types";

const PALETTE: Record<Priority, { bg: string; border: string }> = {
  0: { bg: "rgba(139, 156, 179, 0.35)", border: "#8b9cb3" },
  1: { bg: "rgba(107, 196, 163, 0.35)", border: "#6bc4a3" },
  2: { bg: "rgba(230, 184, 79, 0.35)", border: "#e6b84f" },
  3: { bg: "rgba(240, 113, 120, 0.4)", border: "#f07178" },
};

export function priorityStyle(priority: Priority): CSSProperties {
  const p = PALETTE[priority];
  return {
    background: p.bg,
    borderColor: p.border,
  };
}
