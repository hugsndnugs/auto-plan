# Bug and security review — auto-plan (2026-04-04)

## Automated baseline

| Check | Result |
|--------|--------|
| `npm audit` | 0 vulnerabilities (dev + prod) |
| `npm run build` | Pass |
| `npm test` | Pass (39 tests) |

## Threat model (summary)

Client-only SPA: no backend or secrets. Risks are malformed/malicious **JSON import**, **corrupt localStorage**, **XSS** if unsafe HTML were introduced later, **dependency/CI supply chain**, and **scheduler correctness** (infinite loops, NaN).

## Findings addressed in code

### High — Unvalidated JSON import (`importSnapshot`)

**Risk:** Oversized files, huge job arrays, non-finite numbers, invalid `priority`/`status`, or bad `workSettings` could cause poor UX, hangs, or inconsistent state.

**Mitigation:** Added [`src/lib/snapshotValidation.ts`](src/lib/snapshotValidation.ts) with `assertValidPlannerSnapshot`, strict checks, string/length caps, and `MAX_BACKUP_JSON_CHARS`. Import path and file picker enforce size before confirm. Tests in [`src/lib/snapshotValidation.test.ts`](src/lib/snapshotValidation.test.ts).

### Medium — Persisted state and migrations

**Risk:** Tampered or partially written localStorage could break the app.

**Mitigation:** `sanitizePersistedPlannerSlice` runs at end of `persist` migration; **persist `version` bumped to 4** so existing v3 clients re-run migration once. Types moved to [`src/store/plannerTypes.ts`](src/store/plannerTypes.ts) to avoid circular imports.

### Medium — localStorage quota

**Risk:** `setItem` throws and can break React updates.

**Mitigation:** [`src/lib/persistStorage.ts`](src/lib/persistStorage.ts) wraps `setItem` in try/catch and dispatches `STORAGE_QUOTA_EVENT`; [`src/App.tsx`](src/App.tsx) shows a toast.

### Medium — Inverted or invalid work hours

**Risk:** `workEndMinutes < workStartMinutes` made `availableMin` negative in `buildSegments`, risking a tight loop until the iteration guard.

**Mitigation:** [`src/scheduler/workWindows.ts`](src/scheduler/workWindows.ts) clamps bounds; [`src/scheduler/segments.ts`](src/scheduler/segments.ts) skips non-positive `take`; regression test in [`src/scheduler/scheduler.test.ts`](src/scheduler/scheduler.test.ts).

### Low — `datetime-local` / `time` parsing

**Risk:** Invalid strings produced NaN ms and propagated into jobs.

**Mitigation:** [`fromDatetimeLocalValue`](src/lib/dates.ts) returns `NaN` when invalid; job editor validates and shows `role="alert"` errors; [`timeToMinutes`](src/App.tsx) guards non-finite values.

### Low — Drag payload tampering

**Risk:** Non-finite `segmentStartMs` from crafted drag data.

**Mitigation:** [`WeekGrid.tsx`](src/components/WeekGrid.tsx) and [`MonthGrid.tsx`](src/components/MonthGrid.tsx) require `Number.isFinite(segmentStartMs)`.

### Supply chain — GitHub Actions

**Mitigation:** [`.github/workflows/pages.yml`](.github/workflows/pages.yml) pins `actions/checkout`, `actions/setup-node`, `actions/upload-pages-artifact`, and `actions/deploy-pages` to full commit SHAs (comments note the tag).

## Informational (no code change)

- **XSS:** User strings are still plain React text; no `dangerouslySetInnerHTML`. Keep it that way; sanitize if rich text is added later.
- **Google Fonts (index.html):** Loaded without SRI; acceptable for many apps; harden with self-hosted fonts or integrity if policy requires.
- **CSP:** Not set on GitHub Pages by default; optional future hardening via meta or hosting headers.
- **ESLint / `eslint-plugin-react-hooks`:** Still optional; would catch more React footguns over time.

## Files touched (implementation summary)

- New: `src/lib/snapshotValidation.ts`, `src/lib/persistStorage.ts`, `src/store/plannerTypes.ts`, `src/lib/snapshotValidation.test.ts`
- Updated: `src/store/plannerStore.ts`, `src/App.tsx`, `src/scheduler/workWindows.ts`, `src/scheduler/segments.ts`, `src/lib/dates.ts`, `src/components/WeekGrid.tsx`, `src/components/MonthGrid.tsx`, `src/scheduler/scheduler.test.ts`, `.github/workflows/pages.yml`
