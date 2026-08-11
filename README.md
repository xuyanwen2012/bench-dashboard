# bench-dashboard

Local read-only dashboard over the LLaMA benchmark `runs.db` (written by the
separate Python harness — this app never writes to it; the connection is opened
`{ readonly: true }` and binds to localhost only).

```bash
bun install
bun run dashboard                 # serves API + UI from ./runs.db at http://127.0.0.1:5173/
bun run dashboard --db seed.db    # point at a different db file
PORT=8000 bun run dashboard       # different port
```

No `runs.db` yet? Generate demo data (never auto-run, never targets `runs.db`):

```bash
bun run seed.ts        # writes ./seed.db (282 e2e + 480 sweep rows; 4 devices x 2 drivers each,
                       #  3 branches, 1B/3B/8B, sweeps on 3 devices — a full mockup db, all fabricated)
bun run dashboard --db seed.db
```

## Benchmark categories

Two categories, kept fully separate — a side panel selects between them:

- **e2e** — whole-model runs in the `runs` table; prefill + decode tok/s per run.
- **tile sweep** — kernel microbenchmarks in the `sweep_runs` table; tile m/n/k are
  real columns and **prefill tok/s is the only metric**. No `config_hash` — a cell
  is identified by commit+device+tile. If the db predates `sweep_runs`, the sweep
  endpoints return empty instead of erroring.

## Views

e2e category:

- **configs** — per config: model, n, decode mean/sd/CoV%, prefill mean/sd; flags for
  under-sampled (n<5), noisy (CoV>5%), and measurement-quality (⚠, below); click a row
  for its runs, which open with an aggregate summary (mean/sd/CoV of decode, prefill,
  e2e). Aggregated directly from `runs` (not the `config_stats` view, which has no
  model column or prefill stats). Default is the flat, column-sortable table; a
  **group by settings** toggle switches to one block per device+driver+model+branch
  combo, its commits beneath in first-seen order (a config_hash is per commit, so
  "the same settings" appears once per commit — grouping makes that legible). A
  stat strip shows configs · total runs · quality-flagged count.
- **trend** — stacked panels of mean ± sd per commit (first-seen order) for the
  selected device+branch+model: e2e, prefill, decode tok/s, each toggleable via checkbox.
  e2e = `3072 / (2048/prefill_tps + 1024/decode_tps)` (the standard 2048-prefill +
  1024-decode run shape; constants in `src/theme.ts`). Points whose mean shifted ≥2σ
  vs the previous commit (Welch z on the rep stats, min 1% move) render as ▲/▼ status
  triangles — both directions, since a "gain" is often the previous commit measured
  heat-soaked; details in the tooltip.
- **run `#/run/<id>`** — full row: metadata, thermals, quality flags, e2e tok/s,
  copyable cmdline, and the per-iteration samples as a strip plot.
- **compare** — pick a metric (decode/prefill/e2e), an x-axis dimension and an optional
  series dimension (model / branch / device / driver), fix the rest; grouped bars with
  sd whiskers plus a numbers table. Each cell aggregates only the **latest commit** in
  its group (hash shown in the table/tooltip). The view **never pools across a
  dimension**: models are three different tests, so when model is off-axis and unfixed
  ("all (faceted)") the chart renders one panel per model — own y-scale, shared
  x/series and legend — and the table gains a model column (`facet=model` on the API,
  latest commit chosen per model). Any *other* unfixed non-axis dimension with more
  than one value co-occurring with the fixed picks blocks the chart with one-click
  value buttons instead of silently averaging (a dimension with a single co-occurring
  value — e.g. one driver on the fixed device — never blocks). Criteria live in the
  URL, so comparisons are bookmarkable.
  `GET /api/compare?metric=&x=&series=&facet=&<fixed dims>` backs it.

tile-sweep category:

- **heatmap `#/sweep`** — prefill tok/s over tile m×n with a k selector, per
  commit+device.
- **trend `#/sweep/trend`** — best tile (by mean prefill) per commit for the selected
  device, point labels showing which m×n×k won. `GET /api/sweeptrend` backs it. Same
  ▲/▼ ≥2σ shift marking as the e2e trend (tooltip notes when the winning tile changed).

## Measurement-quality flags

`quality.ts` scores each e2e run/config against the thermal-protocol signatures from
`../CLAUDE.md`; flags are advisory strings attached by `/api/configs`, `/api/runs`,
and `/api/run/:id` and shown as ⚠ badges:

- per run: `hot start +X°C` (started ≥5 °C above the config's coolest start — a
  skipped cooldown; within-run rise is normal and never flagged, as is
  `freq_pinned=0` on phones), `samples ↓X%` (first-half → second-half mean of the
  per-iteration samples declined ≥5%), `dirty`.
- per config: `reps ↓X%` — within some session, rep means declined ≥5% first→last with
  ≥80% of steps decreasing (the classic heat-soak pattern) — plus counts of the
  per-run flags (`hot start ×N`, `samples↓ ×N`, `dirty ×N`).

Theme: light by default; the header button toggles dark and the choice persists.
Stack notes: UI controls for the compare view and shared chrome are shadcn/ui; data
fetching goes through TanStack Query (cached back-flips); charts are ECharts.

The device/branch/driver/model selectors at the top are shared across views and
multi-select: each dimension keeps zero or more values (empty = any), comma-joined
in the URL and in API params (`model=1b,3b` → SQL `IN (...)`). Option lists come
from the active category's table (`/api/meta` returns `{ e2e: {...}, sweep: {...} }`)
and narrow facet-style: a dropdown only offers values co-occurring with the *other*
dimensions' selections (`meta.*.combos` carries the distinct tuples), never narrowed
by its own selection, with stale-but-selected values kept listed so they can be
unchecked.
The selection is mirrored into the hash query (`#/trend?device=…&model=…`), so any
filtered view is bookmarkable like compare; a link **with** a query is authoritative,
while a bare `#/trend` keeps the in-session selection. The per-commit views (trend,
sweep heatmap/trend) refuse to pool a multi-selection into one mean — they ask for a
single pick instead; use compare for side-by-side. API endpoints (`/api/configs`,
`/api/runs?config_hash=`, `/api/run/:id`, `/api/trend?device=&branch=&model=`,
`/api/tilesweep?commit=&device=`, `/api/sweeptrend?device=`, `/api/meta`)
exclude rows with `excluded = 1` unless `?include_excluded=1`.

## Development

```bash
bun run lint       # biome check (lint + format + import order)
bun run lint:fix   # same, applying safe fixes
bun run format     # biome format --write only
bun run typecheck  # tsc --noEmit
```

## Schema note

The real `schema.sql` did not exist when this was built; the table/view DDL in
`seed.ts` follows the agreed column list (see `openspec/changes/add-benchmark-dashboard/`).
When the harness's `schema.sql` lands, reconcile column names in `db.ts`
(notably the `ts` timestamp column) if they differ.

**The harness must be updated for the category split**: tile-sweep results go into
the separate `sweep_runs` table (DDL in `seed.ts`) with `tile_m`/`tile_n`/`tile_k`
integer columns and `prefill_tps`; the `runs` table no longer has a `tiles` column
and holds only e2e runs.
