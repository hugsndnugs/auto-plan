import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
  type FormEvent,
} from "react";
import { useSchedule } from "@/hooks/useSchedule";
import {
  PRIORITY_LABELS,
  type Job,
  type Priority,
  type WorkSettings,
} from "@/scheduler/types";
import { usePlannerStore } from "@/store/plannerStore";
import { MonthGrid } from "@/components/MonthGrid";
import { WeekGrid } from "@/components/WeekGrid";
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
  HIGH_PRIORITY_AUTO_START_OFFSET_DAYS,
  HIGH_SLIP_GRACE_DAYS,
  LOW_PRIORITY_OFFSET_DAYS,
  URGENT_FIRST_START_WITHIN_MS,
} from "@/scheduler/priorityPolicy";
import "./App.css";

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

  const overflowLabels = useMemo(
    () =>
      pack.placements
        .filter((p) => p.overflow)
        .map((p) => jobsById.get(p.jobId)?.title ?? p.jobId),
    [pack.placements, jobsById],
  );

  const slipMessages = useMemo(() => {
    const lines: string[] = [];
    const urgent = pack.placements
      .filter((p) => p.slip === "urgent")
      .map((p) => jobsById.get(p.jobId)?.title ?? p.jobId);
    const high = pack.placements
      .filter((p) => p.slip === "high")
      .map((p) => jobsById.get(p.jobId)?.title ?? p.jobId);
    if (urgent.length > 0) {
      lines.push(
        `Urgent (aim for first work within ~${Math.round(URGENT_FIRST_START_WITHIN_MS / 86400000)} day): backlog pushed — ${urgent.join(", ")}`,
      );
    }
    if (high.length > 0) {
      lines.push(
        `High (aim for auto-placed work to start ~${HIGH_PRIORITY_AUTO_START_OFFSET_DAYS} days after add; backlog if first work is more than ~${HIGH_SLIP_GRACE_DAYS} days after that window): ${high.join(", ")}`,
      );
    }
    return lines;
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

  const onImportFile: ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    void f
      .text()
      .then((text) => {
        importSnapshot(text);
        setSelectedId(null);
      })
      .catch((err: unknown) => {
        alert(err instanceof Error ? err.message : "Import failed");
      })
      .finally(() => {
        e.target.value = "";
      });
  };

  return (
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
            onChange={onImportFile}
          />
        </div>
      </header>

      <aside className="app__aside">
        {overflowLabels.length > 0 && (
          <div className="banner" role="status">
            Not enough working time in the horizon for:{" "}
            {overflowLabels.join(", ")}. Shorten duration or extend the date range.
          </div>
        )}
        {slipMessages.map((msg, i) => (
          <div key={`slip-${i}`} className="banner banner--slip" role="status">
            {msg}
          </div>
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
          <h2>Jobs</h2>
          {jobs.length === 0 ? (
            <p className="empty-hint">
              No jobs yet. Add one above — duration can span multiple working days.
            </p>
          ) : (
            <ul className="job-list">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
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

      <main className="app__main">
        {viewMode === "week" ? (
          <WeekGrid
            weekStartMs={viewRangeStartMs}
            segments={pack.allSegments}
            jobsById={jobsById}
            workSettings={workSettings}
            onSelectJob={(id) => setSelectedId(id)}
            onMoveJob={onMoveJob}
          />
        ) : (
          <MonthGrid
            monthStartMs={viewRangeStartMs}
            segments={pack.allSegments}
            jobsById={jobsById}
            workSettings={workSettings}
            onSelectJob={(id) => setSelectedId(id)}
            onMoveJob={onMoveJob}
          />
        )}
      </main>
    </div>
  );
}

function minutesPerWorkDay(settings: WorkSettings): number {
  return Math.max(1, settings.workEndMinutes - settings.workStartMinutes);
}

/** Whole working days only — stored minutes are always N × (length of workday). */
function durationMinutesFromWorkDays(
  workDays: number,
  settings: WorkSettings,
): number {
  const mpd = minutesPerWorkDay(settings);
  const raw = Math.round(Number(workDays));
  const days = Number.isFinite(raw)
    ? Math.max(1, Math.min(500, raw))
    : 1;
  return Math.max(15, days * mpd);
}

/** How many whole working days best match stored minutes (for edit form). */
function wholeWorkDaysFromDurationMinutes(
  minutes: number,
  settings: WorkSettings,
): number {
  const mpd = minutesPerWorkDay(settings);
  if (minutes <= 0) return 1;
  return Math.max(1, Math.min(500, Math.round(minutes / mpd)));
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
          {([0, 1, 2, 3] as const).map((k) => (
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
      <p className="priority-hint">
        Urgent and High are packed first (preferred start before auto-placed; then older adds first).
        Low auto-starts
        after ~{LOW_PRIORITY_OFFSET_DAYS} days unless you set a preferred start. High auto-starts
        ~{HIGH_PRIORITY_AUTO_START_OFFSET_DAYS} days after you add the job unless you set a
        preferred start. Alerts show if Urgent first work is later than ~
        {Math.round(URGENT_FIRST_START_WITHIN_MS / 86400000)} day from now, or if High first work
        is more than ~{HIGH_SLIP_GRACE_DAYS} days after that High window (backlog).
      </p>
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
  const [earlyEnd, setEarlyEnd] = useState(toDatetimeLocalValue(Date.now()));

  const save = () => {
    const durationMinutes = durationMinutesFromWorkDays(workDays, workSettings);
    onSave({
      title: title.trim() || "Untitled",
      durationMinutes,
      priority,
      anchorStartMs: anchor ? fromDatetimeLocalValue(anchor) : null,
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
          {([0, 1, 2, 3] as const).map((k) => (
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
      </div>
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
              onClick={() => onFinishEarly(fromDatetimeLocalValue(earlyEnd))}
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
        <span>Working days</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {dayNames.map((n, i) => (
            <button
              key={n}
              type="button"
              className="btn"
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
  return a * 60 + b;
}
