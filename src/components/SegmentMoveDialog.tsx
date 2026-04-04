import { useEffect, useId, useRef, useState } from "react";
import type { WorkSettings } from "@/scheduler/types";
import { toDatetimeLocalValue } from "@/lib/dates";
import { coerceDatetimeLocalToDropStart } from "@/lib/segmentMove";

export interface SegmentMoveDialogProps {
  open: boolean;
  jobTitle: string;
  segmentStartMs: number;
  workSettings: WorkSettings;
  onClose: () => void;
  onApply: (dropStartMs: number) => void;
}

export function SegmentMoveDialog({
  open,
  jobTitle,
  segmentStartMs,
  workSettings,
  onClose,
  onApply,
}: SegmentMoveDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [value, setValue] = useState(() =>
    toDatetimeLocalValue(segmentStartMs),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(toDatetimeLocalValue(segmentStartMs));
      setError(null);
    }
  }, [open, segmentStartMs]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) el.close();
  }, [open]);

  const submit = () => {
    setError(null);
    const drop = coerceDatetimeLocalToDropStart(value, workSettings);
    if (drop === null) {
      setError(
        "Choose a date and time on a working day, within your work hours.",
      );
      return;
    }
    onApply(drop);
  };

  return (
    <dialog
      ref={dialogRef}
      className="segment-move-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className="segment-move-dialog__title">
        Move “{jobTitle}”
      </h2>
      <p className="segment-move-dialog__body">
        Set when this block should start. Time snaps to 15 minutes and must fall
        inside your working hours.
      </p>
      <div className="segment-move-dialog__field">
        <label htmlFor="segment-move-when">Start</label>
        <input
          id="segment-move-when"
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      {error && (
        <p className="segment-move-dialog__error" role="alert">
          {error}
        </p>
      )}
      <div className="segment-move-dialog__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={submit}>
          Apply move
        </button>
      </div>
    </dialog>
  );
}
