import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
  type FormEvent,
} from "react";
import { useSchedule } from "@/hooks/useSchedule";
import {
  PRIORITY_LABELS,
  priorityOptionsForEditor,
  type Job,
  type Priority,
  type WorkSettings,
  UI_SELECTABLE_PRIORITIES,
} from "@/scheduler/types";
import { usePlannerStore } from "@/store/plannerStore";
import { MonthGrid } from "@/components/MonthGrid";
import { SegmentMoveDialog } from "@/components/SegmentMoveDialog";
import { WeekGrid } from "@/components/WeekGrid";
import {
  useMediaQuery,
  usePreferTouchMoveControls,
} from "@/hooks/useMediaQuery";
import {
  formatDayLabel,
  formatMonthYear,
  fromDatetimeLocalValue,
  startOfMonthLocal,
  startOfWeekMonday,
  toDatetimeLocalValue,
} from "@/lib/dates";
import { anchorAfterSegmentMove } from "@/lib/dragAnchor";
import {
  durationMinutesFromWorkDays,
  wholeWorkDaysFromDurationMinutes,
} from "@/lib/workDayDuration";
import {
  HIGH_PRIORITY_AUTO_START_OFFSET_DAYS,
  HIGH_SLIP_GRACE_DAYS,
  URGENT_FIRST_START_WITHIN_MS,
} from "@/scheduler/priorityPolicy";
import { MAX_BACKUP_JSON_CHARS } from "@/lib/snapshotValidation";
import { STORAGE_QUOTA_EVENT } from "@/lib/persistStorage";
import "./App.css";

const BANNER_NAME_CAP = 4;

function truncateNames(names: string[]): {
  shown: string[];
  rest: number;
} {
  if (names.length <= BANNER_NAME_CAP) {
    return { shown: names, rest: 0 };
  }
  return {
    shown: names.slice(0, BANNER_NAME_CAP),
    rest: names.length - BANNER_NAME_CAP,
  };
}

function OverflowBanner({ labels }: { labels: string[] }) {
  const { shown, rest } = truncateNames(labels);
  return (
    <div className="banner" role="status">
      <p className="banner__lead">
        Not enough working time in the horizon for: {shown.join(", ")}
        {rest > 0 ? ` +${rest} more` : ""}. Shorten a duration or adjust working
        hours.
      </p>
      <details className="banner__details">
        <summary>Why this appears</summary>
        <p className="banner__detail-text">
          Jobs are packed into about six months of working time from today (or
          your visible range). If work does not fit, it is listed as overflow.
        </p>
      </details>
    </div>
  );
}

function SlipBanner({
  banner,
}: {
  banner: {
    kind: "urgent" | "high";
    titles: string[];
    summary: string;
    detail: string;
  };
}) {
  const { shown, rest } = truncateNames(banner.titles);
  return (
    <div className="banner banner--slip" role="status">
      <p className="banner__lead">{banner.summary}</p>
      <p className="banner__names">
        {shown.join(", ")}
        {rest > 0 ? ` +${rest} more` : ""}
      </p>
      <details className="banner__details">
        <summary>Details</summary>
        <p className="banner__detail-text">{banner.detail}</p>
      </details>
    </div>
  );
}

export default function App() {
  const jobs = usePlannerStore((s) => s.jobs);
  const workSettings = usePlannerStore((s) => s.workSettings);
  const viewRangeStartMs = usePlannerStore((s) => s.viewRangeStartMs);
  const viewMode = usePlannerStore((s) => s.viewMode);
  const addJob = usePlannerStore((s) => s.addJob);
  const updateJob = usePlannerStore((s) => s.updateJob);
  const deleteJob = usePlannerStore((s) => s.deleteJob);
  const setWorkSettings = usePlannerStore((s) => s.setWorkSettings);
  const shiftCalendar = usePlannerStore((s) => s.shiftCalendar);
  const setViewRangeStartMs = usePlannerStore((s) => s.setViewRangeStartMs);
  const setViewMode = usePlannerStore((s) => s.setViewMode);
  const exportSnapshot = usePlannerStore((s) => s.exportSnapshot);
  const importSnapshot = usePlannerStore((s) => s.importSnapshot);

  const pack = useSchedule(jobs, workSettings, viewRangeStartMs, viewMode);
  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? jobsById.get(selectedId) : undefined;

  const fileRef = useRef<HTMLInputElement>(null);
  const importDialogRef = useRef<HTMLDialogElement>(null);
  const [pendingImportText, setPendingImportText] = useState<string | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<{
    jobId: string;
    segmentStartMs: number;
  } | null>(null);
  const narrowLayout = useMediaQuery("(max-width: 960px)");
  const [mobileTab, setMobileTab] = useState<"schedule" | "jobs">("schedule");
  const touchMoveControls = usePreferTouchMoveControls();

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const onQuota = () => {
      setToast(
        "Browser storage is full. Export a backup, then free space or use another browser profile.",
      );
    };
    window.addEventListener(STORAGE_QUOTA_EVENT, onQuota);
    return () => window.removeEventListener(STORAGE_QUOTA_EVENT, onQuota);
  }, []);

  const overflowLabels = useMemo(
    () =>
      pack.placements
        .filter((p) => p.overflow)
        .map((p) => jobsById.get(p.jobId)?.title ?? p.jobId),
    [pack.placements, jobsById],
  );

  const slipBanners = useMemo(() => {
    type SlipKind = "urgent" | "high";
    const out: {
      kind: SlipKind;
      titles: string[];
      summary: string;
      detail: string;
    }[] = [];
    const urgent = pack.placements
      .filter((p) => p.slip === "urgent")
      .map((p) => jobsById.get(p.jobId)?.title ?? p.jobId);
    const high = pack.placements
      .filter((p) => p.slip === "high")
      .map((p) => jobsById.get(p.jobId)?.title ?? p.jobId);
    const urgentDays = Math.round(URGENT_FIRST_START_WITHIN_MS / 86400000);
    if (urgent.length > 0) {
      out.push({
        kind: "urgent",
        titles: urgent,
        summary: `Urgent jobs are starting later than ~${urgentDays} day from now due to backlog.`,
        detail: `Urgent tier aims for first work within about ${urgentDays} day from now. Preferred starts and older adds pack first within the same priority.`,
      });
    }
    if (high.length > 0) {
      out.push({
        kind: "high",
        titles: high,
        summary:
          "Some High jobs start later than the usual auto-placement window (heavy backlog).",
        detail: `High auto-placed work normally starts about ${HIGH_PRIORITY_AUTO_START_OFFSET_DAYS} days after you add the job unless you set a preferred start. The backlog alert appears if first work is more than about ${HIGH_SLIP_GRACE_DAYS} days after that window.`,
      });
    }
    return out;
  }, [pack.placements, jobsById]);

  const periodLabel = useMemo(() => {
    if (viewMode === "week") {
      return `${formatDayLabel(viewRangeStartMs)} — ${formatDayLabel(viewRangeStartMs + 6 * 86400000)}`;
    }
    return formatMonthYear(startOfMonthLocal(viewRangeStartMs));
  }, [viewMode, viewRangeStartMs]);

  const goToday = useCallback(() => {
    const now = Date.now();
    if (viewMode === "week") {
      setViewRangeStartMs(startOfWeekMonday(now).getTime());
    } else {
      setViewRangeStartMs(startOfMonthLocal(now));
    }
  }, [viewMode, setViewRangeStartMs]);

  const onExport = useCallback(() => {
    const blob = new Blob([exportSnapshot()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `auto-plan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setDataError(null);
    setToast("Backup file downloaded.");
  }, [exportSnapshot]);

  const onMoveJob = useCallback(
    (args: {
      jobId: string;
      draggedSegmentStartMs: number;
      dropStartMs: number;
    }) => {
      const job = jobsById.get(args.jobId);
      if (!job || job.status === "done" || job.status === "cancelled") return;
      const anchor = anchorAfterSegmentMove(
        pack.placements,
        args.jobId,
        args.draggedSegmentStartMs,
        args.dropStartMs,
      );
      if (anchor === null) return;
      updateJob(args.jobId, { anchorStartMs: anchor });
    },
    [jobsById, pack.placements, updateJob],
  );

  const resetFileInput = useCallback(() => {
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const cancelPendingImport = useCallback(() => {
    setPendingImportText(null);
    resetFileInput();
    importDialogRef.current?.close();
  }, [resetFileInput]);

  const confirmImport = useCallback(() => {
    if (pendingImportText == null) return;
    try {
      importSnapshot(pendingImportText);
      setSelectedId(null);
      setDataError(null);
      setToast("Backup imported. Your schedule was replaced.");
      cancelPendingImport();
    } catch (err: unknown) {
      setDataError(
        err instanceof Error ? err.message : "Could not read that backup file.",
      );
      cancelPendingImport();
    }
  }, [pendingImportText, importSnapshot, cancelPendingImport]);

  const onImportFile: ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    void f
      .text()
      .then((text) => {
        if (text.length > MAX_BACKUP_JSON_CHARS) {
          setDataError(
            `That file is too large (max ${MAX_BACKUP_JSON_CHARS} characters).`,
          );
          resetFileInput();
          return;
        }
        setPendingImportText(text);
        importDialogRef.current?.showModal();
      })
      .catch((err: unknown) => {
        setDataError(
          err instanceof Error ? err.message : "Could not read that file.",
        );
        resetFileInput();
      });
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (importDialogRef.current?.open) return;
      const t = ev.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (!ev.altKey) return;
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        shiftCalendar(-1);
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        shiftCalendar(1);
      } else if (ev.key === "t" || ev.key === "T") {
        ev.preventDefault();
        goToday();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shiftCalendar, goToday]);

  return (
    <>
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Auto Plan</h1>
        <div className="app__toolbar">
          <div className="view-toggle" role="group" aria-label="Calendar view">
            <button
              type="button"
              className={`btn${viewMode === "week" ? " btn--toggle-active" : ""}`}
              onClick={() => setViewMode("week")}
            >
              Week
            </button>
            <button
              type="button"
              className={`btn${viewMode === "month" ? " btn--toggle-active" : ""}`}
              onClick={() => setViewMode("month")}
            >
              Month
            </button>
          </div>
          <div className="week-nav">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => shiftCalendar(-1)}
            >
              ← Prev
            </button>
            <span className="week-nav__label">{periodLabel}</span>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => shiftCalendar(1)}
            >
              Next →
            </button>
            <button type="button" className="btn" onClick={goToday}>
              {viewMode === "week" ? "This week" : "This month"}
            </button>
          </div>
          <button type="button" className="btn" onClick={onExport}>
            Export JSON
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => fileRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose JSON backup file to import"
            onChange={onImportFile}
          />
          {!touchMoveControls && (
            <span className="toolbar-shortcut-hint" aria-hidden>
              Alt+← → period · Alt+T today
            </span>
          )}
        </div>
        {toast && (
          <div className="app__toast" role="status">
            {toast}
          </div>
        )}
      </header>

      {narrowLayout && (
        <div className="mobile-tab-bar" role="tablist" aria-label="Main panels">
          <button
            type="button"
            role="tab"
            className={`mobile-tab-bar__btn${mobileTab === "schedule" ? " mobile-tab-bar__btn--active" : ""}`}
            aria-selected={mobileTab === "schedule"}
            onClick={() => setMobileTab("schedule")}
          >
            Schedule
          </button>
          <button
            type="button"
            role="tab"
            className={`mobile-tab-bar__btn${mobileTab === "jobs" ? " mobile-tab-bar__btn--active" : ""}`}
            aria-selected={mobileTab === "jobs"}
            onClick={() => setMobileTab("jobs")}
          >
            Jobs
          </button>
        </div>
      )}

      <aside
        className={`app__aside${narrowLayout && mobileTab === "schedule" ? " app__panel--mobile-hidden" : ""}`}
      >
        {dataError && (
          <div className="banner banner--error" role="alert">
            {dataError}{" "}
            <button
              type="button"
              className="banner__dismiss"
              onClick={() => setDataError(null)}
            >
              Dismiss
            </button>
          </div>
        )}
        {overflowLabels.length > 0 && (
          <OverflowBanner labels={overflowLabels} />
        )}
        {slipBanners.map((b) => (
          <SlipBanner key={b.kind} banner={b} />
        ))}

        <section className="panel">
          <h2>Add job</h2>
          <AddJobForm
            workSettings={workSettings}
            onAdd={(fields) => {
              addJob(fields);
            }}
          />
        </section>

        <section className="panel">
          <h2 id="job-list-heading">Jobs</h2>
          {jobs.length === 0 ? (
            <p className="empty-hint">
              No jobs yet. Add one above — duration can span multiple working days.
            </p>
          ) : (
            <ul
              className="job-list"
              role="listbox"
              aria-labelledby="job-list-heading"
            >
              {jobs.map((j) => (
                <li key={j.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedId === j.id}
                    data-active={selectedId === j.id}
                    onClick={() => setSelectedId(j.id)}
                  >
                    {j.title}
                    <div className="job-list__meta">
                      {PRIORITY_LABELS[j.priority]} · {j.status}
                      {j.status === "done" && j.actualEndMs
                        ? ` · done ${formatDayLabel(j.actualEndMs)}`
                        : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selected && (
          <section className="panel">
            <h2>Edit: {selected.title}</h2>
            <JobEditor
              key={selected.id}
              job={selected}
              workSettings={workSettings}
              onSave={(patch) => {
                updateJob(selected.id, patch);
              }}
              onDelete={() => {
                deleteJob(selected.id);
                setSelectedId(null);
              }}
              onFinishEarly={(actualEndMs) => {
                updateJob(selected.id, {
                  status: "done",
                  actualEndMs,
                  progressMinutesConsumed: selected.durationMinutes,
                });
                setSelectedId(null);
              }}
              onStartWork={() => {
                updateJob(selected.id, {
                  status: "in_progress",
                  progressMinutesConsumed: selected.progressMinutesConsumed ?? 0,
                });
              }}
            />
          </section>
        )}

        <section className="panel">
          <h2>Working hours</h2>
          <SettingsForm
            settings={workSettings}
            onChange={setWorkSettings}
          />
        </section>
      </aside>

      <main
        className={`app__main${narrowLayout && mobileTab === "jobs" ? " app__panel--mobile-hidden" : ""}`}
      >
        {viewMode === "week" && jobs.length === 0 && (
          <p className="main-empty-hint">
            Add a job in the sidebar to see it packed on the week timeline.
          </p>
        )}
        {viewMode === "week" ? (
          <div className="week-grid-scroll">
            <WeekGrid
              weekStartMs={viewRangeStartMs}
              segments={pack.allSegments}
              jobsById={jobsById}
              workSettings={workSettings}
              onSelectJob={(id) => setSelectedId(id)}
              onMoveJob={onMoveJob}
              touchMoveControls={touchMoveControls}
              onOpenSegmentMove={setMoveTarget}
            />
          </div>
        ) : (
          <MonthGrid
            monthStartMs={viewRangeStartMs}
            segments={pack.allSegments}
            jobsById={jobsById}
            workSettings={workSettings}
            onSelectJob={(id) => setSelectedId(id)}
            onMoveJob={onMoveJob}
            touchMoveControls={touchMoveControls}
            onOpenSegmentMove={setMoveTarget}
          />
        )}
      </main>
    </div>

    <dialog
      ref={importDialogRef}
      className="import-dialog"
      aria-labelledby="import-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        cancelPendingImport();
      }}
    >
      <h2 id="import-dialog-title" className="import-dialog__title">
        Replace all data?
      </h2>
      <p className="import-dialog__body">
        Importing will replace every job and your working-hours settings in this
        browser. This cannot be undone (except by importing another backup).
      </p>
      <div className="import-dialog__actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={cancelPendingImport}
        >
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={confirmImport}>
          Replace and import
        </button>
      </div>
    </dialog>

    <SegmentMoveDialog
      open={moveTarget !== null}
      jobTitle={
        moveTarget
          ? (jobsById.get(moveTarget.jobId)?.title ?? moveTarget.jobId)
          : ""
      }
      segmentStartMs={moveTarget?.segmentStartMs ?? 0}
      workSettings={workSettings}
      onClose={() => setMoveTarget(null)}
      onApply={(dropStartMs) => {
        if (!moveTarget) return;
        onMoveJob({
          jobId: moveTarget.jobId,
          draggedSegmentStartMs: moveTarget.segmentStartMs,
          dropStartMs,
        });
        setMoveTarget(null);
      }}
    />
    </>
  );
}

function AddJobForm({
  workSettings,
  onAdd,
}: {
  workSettings: WorkSettings;
  onAdd: (j: Omit<Job, "id">) => void;
}) {
  const [title, setTitle] = useState("");
  const [workDays, setWorkDays] = useState(1);
  const [priority, setPriority] = useState<Priority>(1);
  const [urgentInsert, setUrgentInsert] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const durationMinutes = durationMinutesFromWorkDays(workDays, workSettings);
    const pri = urgentInsert ? 3 : priority;
    onAdd({
      title: title.trim() || "Untitled",
      durationMinutes,
      priority: pri,
      anchorStartMs: null,
      status: "planned",
    });
    setTitle("");
    setUrgentInsert(false);
  };

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Client install"
        />
      </div>
      <div className="field">
        <label htmlFor="duration-days">Duration (working days)</label>
        <input
          id="duration-days"
          type="number"
          min={1}
          max={500}
          step={1}
          value={workDays}
          onChange={(e) => {
            const v = Number(e.target.value);
            setWorkDays(
              Number.isFinite(v) ? Math.max(1, Math.min(500, Math.round(v))) : 1,
            );
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="pri">Priority</label>
        <select
          id="pri"
          value={urgentInsert ? 3 : priority}
          disabled={urgentInsert}
          onChange={(e) => setPriority(Number(e.target.value) as Priority)}
        >
          {UI_SELECTABLE_PRIORITIES.map((k) => (
            <option key={k} value={k}>
              {PRIORITY_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
        <input
          type="checkbox"
          checked={urgentInsert}
          onChange={(e) => setUrgentInsert(e.target.checked)}
        />
        Priority insert (Urgent)
      </label>
      <details className="priority-hint-details">
        <summary className="priority-hint-summary">How priority works</summary>
        <p className="priority-hint">
          New jobs use <strong>Normal</strong> or <strong>Urgent</strong> (or Priority insert for
          Urgent). Urgent packs first; Normal comes after Urgent work. Additional priority tiers are
          reserved for a future release; the scheduler still understands them for imported data.
        </p>
      </details>
      <button type="submit" className="btn btn--primary">
        Add to schedule
      </button>
    </form>
  );
}

function JobEditor({
  job,
  workSettings,
  onSave,
  onDelete,
  onFinishEarly,
  onStartWork,
}: {
  job: Job;
  workSettings: WorkSettings;
  onSave: (patch: Partial<Job>) => void;
  onDelete: () => void;
  onFinishEarly: (actualEndMs: number) => void;
  onStartWork: () => void;
}) {
  const [title, setTitle] = useState(job.title);
  const [workDays, setWorkDays] = useState(() =>
    wholeWorkDaysFromDurationMinutes(job.durationMinutes, workSettings),
  );
  const [priority, setPriority] = useState<Priority>(job.priority);
  const [anchor, setAnchor] = useState(
    job.anchorStartMs != null ? toDatetimeLocalValue(job.anchorStartMs) : "",
  );
  const [notes, setNotes] = useState(job.notes ?? "");
  const [deadline, setDeadline] = useState(
    job.deadlineMs != null ? toDatetimeLocalValue(job.deadlineMs) : "",
  );
  const [earlyEnd, setEarlyEnd] = useState(toDatetimeLocalValue(Date.now()));
  const [formError, setFormError] = useState<string | null>(null);

  const save = () => {
    setFormError(null);
    const durationMinutes = durationMinutesFromWorkDays(workDays, workSettings);
    const n = notes.trim();
    let anchorStartMs: number | null = null;
    if (anchor) {
      const t = fromDatetimeLocalValue(anchor);
      if (!Number.isFinite(t)) {
        setFormError("Preferred start is not a valid date and time.");
        return;
      }
      anchorStartMs = t;
    }
    let deadlineMs: number | undefined;
    if (deadline) {
      const t = fromDatetimeLocalValue(deadline);
      if (!Number.isFinite(t)) {
        setFormError("Deadline is not a valid date and time.");
        return;
      }
      deadlineMs = t;
    }
    onSave({
      title: title.trim() || "Untitled",
      durationMinutes,
      priority,
      anchorStartMs,
      notes: n === "" ? undefined : n,
      deadlineMs,
    });
  };

  return (
    <div>
      <div className="field">
        <label htmlFor="ej-title">Title</label>
        <input
          id="ej-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="ej-days">Duration (total working days)</label>
        <input
          id="ej-days"
          type="number"
          min={1}
          max={500}
          step={1}
          value={workDays}
          onChange={(e) => {
            const v = Number(e.target.value);
            setWorkDays(
              Number.isFinite(v) ? Math.max(1, Math.min(500, Math.round(v))) : 1,
            );
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="ej-pri">Priority</label>
        <select
          id="ej-pri"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value) as Priority)}
        >
          {priorityOptionsForEditor(priority).map((k) => (
            <option key={k} value={k}>
              {PRIORITY_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ej-anchor">Preferred start (optional)</label>
        <input
          id="ej-anchor"
          type="datetime-local"
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
        />
        <p className="field-hint">
          You can also use the Move button on the calendar or drag blocks on a desktop browser.
        </p>
      </div>
      <div className="field">
        <label htmlFor="ej-notes">Notes (optional)</label>
        <textarea
          id="ej-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Context, links, client name…"
          rows={3}
        />
      </div>
      <div className="field">
        <label htmlFor="ej-deadline">Deadline (optional, reference only)</label>
        <input
          id="ej-deadline"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
        <p className="field-hint">
          Does not change packing — for your own planning only.
        </p>
      </div>
      {formError && (
        <p className="field-hint" role="alert">
          {formError}
        </p>
      )}
      <div className="row-actions">
        <button type="button" className="btn btn--primary" onClick={save}>
          Save
        </button>
        {job.status === "planned" && (
          <button type="button" className="btn" onClick={onStartWork}>
            Start work
          </button>
        )}
        {(job.status === "planned" || job.status === "in_progress") && (
          <>
            <div className="field" style={{ width: "100%", marginTop: "0.5rem" }}>
              <label htmlFor="ej-early">Finish early (actual end)</label>
              <input
                id="ej-early"
                type="datetime-local"
                value={earlyEnd}
                onChange={(e) => setEarlyEnd(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const t = fromDatetimeLocalValue(earlyEnd);
                if (!Number.isFinite(t)) {
                  setFormError("Finish time is not a valid date and time.");
                  return;
                }
                setFormError(null);
                onFinishEarly(t);
              }}
            >
              Mark done (early or on time)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => onFinishEarly(Date.now())}
            >
              Finish now
            </button>
          </>
        )}
        <button type="button" className="btn btn--danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function SettingsForm({
  settings,
  onChange,
}: {
  settings: import("@/scheduler/types").WorkSettings;
  onChange: (s: import("@/scheduler/types").WorkSettings) => void;
}) {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const toggleDay = (i: number) => {
    const workDays = [...settings.workDays] as boolean[];
    workDays[i] = !workDays[i];
    onChange({ ...settings, workDays: workDays as typeof settings.workDays });
  };

  return (
    <div>
      <div className="field">
        <label htmlFor="ws">Workday start (local)</label>
        <input
          id="ws"
          type="time"
          value={minutesToTime(settings.workStartMinutes)}
          onChange={(e) =>
            onChange({
              ...settings,
              workStartMinutes: timeToMinutes(e.target.value),
            })
          }
        />
      </div>
      <div className="field">
        <label htmlFor="we">Workday end (local)</label>
        <input
          id="we"
          type="time"
          value={minutesToTime(settings.workEndMinutes)}
          onChange={(e) =>
            onChange({
              ...settings,
              workEndMinutes: timeToMinutes(e.target.value),
            })
          }
        />
      </div>
      <div className="field">
        <span id="workdays-label">Working days</span>
        <div
          className="workday-toggles"
          role="group"
          aria-labelledby="workdays-label"
        >
          {dayNames.map((n, i) => (
            <button
              key={n}
              type="button"
              className="btn workday-toggle"
              aria-pressed={settings.workDays[i]}
              aria-label={`${n} ${settings.workDays[i] ? "working day" : "day off"}`}
              style={{
                opacity: settings.workDays[i] ? 1 : 0.45,
                fontSize: "0.75rem",
                padding: "0.25rem 0.45rem",
              }}
              onClick={() => toggleDay(i)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeToMinutes(s: string): number {
  const [a, b] = s.split(":").map(Number);
  const t = a * 60 + b;
  if (!Number.isFinite(t)) return 8 * 60;
  return Math.max(0, Math.min(24 * 60, Math.floor(t)));
}
