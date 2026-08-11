# Proposal: add-benchmark-dashboard

## Why

Benchmark runs of the LLaMA inference program on Android devices accumulate in a SQLite
database (`runs.db`, written by a separate Python harness), but there is no way to browse
them: spotting noisy or under-sampled configs, tracking regressions across commits,
comparing shader tile sizes, or inspecting a single run's per-iteration spread currently
requires ad-hoc SQL. A small local read-only dashboard makes that data usable.

## What Changes

- New Bun-based local web dashboard (single package, flat layout, localhost-only) that
  reads `runs.db` read-only via `bun:sqlite`.
- Read-only JSON API: `/api/configs`, `/api/runs`, `/api/run/:id`, `/api/trend`,
  `/api/tilesweep`, all excluding `excluded = 1` rows unless `?include_excluded=1`.
- React + Tailwind frontend (charts via ECharts) with four views: configs table, trend
  chart per commit, tile-sweep heatmap, and run detail with per-iteration strip plot;
  a global device/branch/driver_ver filter bar is shared by views 1–3.
- One command runs everything: `bun run dashboard` serves API and built frontend from a
  single process.
- Separate opt-in seed script producing ~200 realistic fake rows into a throwaway DB so
  every view is demonstrable without real data. It is never run automatically and never
  targets the real `runs.db`.
- **Constraint, not a change**: the DB schema (`schema.sql`) is owned by the Python
  harness and must not be modified. The dashboard never writes to `runs.db`.

**Assumptions recorded** (schema.sql / runs.db do not exist in this directory yet):
- The column set described in the brief (config_hash, session_id, repeat_idx,
  commit_hash, branch, dirty, device, driver_ver, freq_pinned, temp_start_mc,
  temp_end_mc, battery_pct, cmdline, params JSON, tiles JSON with m/n/k, decode_tps,
  prefill_tps, samples JSON, excluded, plus a timestamp) and the `config_stats` view
  (n, mean_tps, sd_tps, cov_pct per config) are authoritative for planning.
  Implementation begins by reading the real `schema.sql` and reconciling names.
- The seed script writes to an explicit target path (default `seed.db`), creating the
  schema itself if the file is new; pointing it at `runs.db` requires typing that path
  deliberately.
- Thresholds for view 1 highlighting: n < 5 = "under-sampled", CoV > 5% = "noisy"
  (from the brief; trivially adjustable constants).

## Capabilities

### New Capabilities

- `benchmark-api`: read-only HTTP JSON API over `runs.db` — config stats, runs per
  config, single-run detail, per-commit trend aggregates, tile-sweep aggregates, with
  shared filter and excluded-row semantics.
- `dashboard-ui`: the four browser views (configs table, trend, tile-sweep heatmap, run
  detail), global filter bar, dark/dense/monospace styling, served together with the API
  by one `bun run dashboard` process.
- `seed-data`: standalone opt-in script that generates a demonstrable fake dataset in a
  separate DB file, never auto-run against real data.

### Modified Capabilities

None — this OpenSpec root has no existing specs.

## Impact

- New code only, all under this `dashboard/` directory: Bun server, React frontend,
  seed script, `package.json` with the `dashboard` script.
- New dev dependencies: React, Tailwind CSS, ECharts (bundled by Bun; no Node, no Vite
  unless Bun's Tailwind integration blocks us — which requires asking the user first).
- No impact on the Python benchmark harness or the DB schema; `runs.db` is opened
  `{ readonly: true }`.
- Explicitly out of scope: monorepo, Next.js, SSR, ORM, Docker, auth, state-management
  library, caching layer, non-localhost binding, animations.
