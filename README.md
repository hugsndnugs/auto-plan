# Auto Plan

A browser-based job calendar for solo work scheduling. Jobs have **priorities**, **total durations** (including multi-day work in working hours), and a **packing** pass that orders work by priority and sequences it on the timeline. When you **mark a job done early**, remaining work is re-packed automatically.

Use **Week** for the detailed timeline or **Month** for a monthly overview — both support drag-to-reschedule by dragging the job block. The scheduler packs work across a horizon of **six calendar months** from today (or the end of the visible range, whichever is later).

## Development

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

```bash
npm test
```

## Data and backups

- State is stored in **localStorage** under the key `auto-plan-storage` (jobs, working hours, **view mode** week/month, and **visible range** anchor). Jobs gain an **`addedAtMs`** timestamp when first saved in a newer version; older imports without it are assigned the migration time once (see app behavior for High deferral).
- Use **Export JSON** in the app to save a backup file; use **Import JSON** to restore on this or another browser.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repo **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` builds with `npm run build` and deploys the `dist` folder. The site base path is set from `GITHUB_REPOSITORY` so project URLs like `https://<user>.github.io/<repo>/` resolve assets correctly.

For a **local** build with the same base as production, set `GITHUB_REPOSITORY` when building (for example `owner/auto-plan`).

## How scheduling works

- Only **working hours** and **working days** (configured in the sidebar) count toward a job’s duration.
- Long jobs are split into **segments** across consecutive working days.
- **Priority** (high to low: Urgent → High → Normal → Low) controls pack order. Within the same level, jobs with a **preferred start** (from drag or the editor) pack **before** auto-placed jobs; among auto-placed work, **oldest first by add time** (`addedAtMs`). Among preferred starts, **earlier** time first (then stable id).
- **Low**: auto-planned jobs with no preferred start are **deferred by about 7 calendar days** so near-term capacity goes to higher tiers. Set a **preferred start** (or drag in week or month view) to override.
- **High**: auto-planned jobs with no preferred start are **deferred until about 14 calendar days after the job was added**. Set a **preferred start** (or drag in week or month view) to start earlier.
- **Urgent**: if the **first segment** starts later than about **1 day** from now because of backlog, a blue notice lists those jobs.
- **High (backlog alert)**: if the **first segment** starts **more than about 7 days after** that nominal “14 days after add” window because of backlog, a blue notice lists those jobs.
- **Priority insert** adds a job as **Urgent** so it sorts ahead of lower-priority work when the schedule is recomputed.
- **Finish now** or **Mark done** records an actual end time; completed jobs no longer consume the timeline, so following work moves earlier when possible within the same rules.
- **Month view**: drag a job block and drop on a day; vertical position in the cell maps to time of day (same idea as the week timeline).
