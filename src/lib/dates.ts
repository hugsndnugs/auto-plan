/** Monday 00:00 local time for the week containing `ms`. */
export function startOfWeekMonday(ms: number): Date {
  const d = new Date(ms);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function formatDayLabel(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(ms);
}

export function formatTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(ms);
}

export function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

/** Parses a `datetime-local` value; returns **NaN** if the browser cannot parse it. */
export function fromDatetimeLocalValue(s: string): number {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : Number.NaN;
}

/** First day of the calendar month containing `ms`, local midnight. */
export function startOfMonthLocal(ms: number): number {
  const d = new Date(ms);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** First instant of the following calendar month (local). */
export function startOfNextMonthLocal(ms: number): number {
  const d = new Date(ms);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addMonthsLocal(ms: number, delta: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + delta);
  return d.getTime();
}

export interface MonthGridDay {
  dayStartMs: number;
  inCurrentMonth: boolean;
}

/**
 * Up to 42 cells (6 weeks), Monday-first rows, aligned with
 * [startOfWeekMonday](dates.ts).
 */
export function buildMonthGrid(monthAnchorMs: number): MonthGridDay[] {
  const monthStart = startOfMonthLocal(monthAnchorMs);
  const monthDate = new Date(monthStart);
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const gridStart = startOfWeekMonday(monthStart).getTime();
  const days: MonthGridDay[] = [];
  let t = gridStart;
  for (let i = 0; i < 42; i++) {
    const d = new Date(t);
    const inCurrent = d.getFullYear() === y && d.getMonth() === m;
    days.push({ dayStartMs: t, inCurrentMonth: inCurrent });
    t += 86400000;
  }
  return days;
}

export function formatMonthYear(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(ms);
}
