# Design: add-benchmark-dashboard

## Context

See `proposal.md` — Why. Constraints that shape the design, fixed by the user's brief:
Bun only (runtime, bundler, dev server), `bun:sqlite` with `{ readonly: true }`,
React + Tailwind, ECharts, single flat package, localhost-only, one `bun run dashboard`
command, and a hard list of exclusions (no Vite without asking first, no Next.js/SSR,
no ORM, no Docker, no auth, no state-management library, no caching layer).

Current state: this directory is empty apart from OpenSpec scaffolding. `schema.sql`
and `runs.db` are produced by an external Python harness and are not present yet; the
brief's column list is the planning contract, and implementation step 1 is to read the
real `schema.sql` and reconcile exact column names (notably the timestamp column and
which metric `config_stats.mean_tps` aggregates) before freezing SQL.

## Goals / Non-Goals

**Goals:**

- Smallest structure that satisfies the specs: one server file, one seed script, a flat
  `src/` frontend, one `package.json`.
- Every SQL query parameterized and assembled from a shared filter helper so
  excluded-row and device/branch/driver_ver semantics are identical across endpoints.
- Chart styling follows the `dataviz` skill (load it before writing any ECharts code).

**Non-Goals:**

- No live-reload/watch polish beyond what Bun gives for free; this is a local tool.
- No pagination or virtualization — dataset is thousands of rows at most.
- No schema migration handling; the dashboard tracks whatever schema the harness owns.

## Planned file tree

```
dashboard/
  package.json          # deps + "dashboard" script
  bunfig.toml           # bun-plugin-tailwind registration (if needed by chosen path)
  server.ts             # Bun.serve: /api/* + frontend; opens DB readonly
  db.ts                 # opens runs.db, prepared queries, filter/exclusion helper
  seed.ts               # standalone seed script (writable, separate target file)
  index.html            # frontend entry (imported by server for bundling)
  src/
    main.tsx            # React root, hash router, global filter state
    api.ts              # typed fetch helpers for the five endpoints
    styles.css          # Tailwind entry + dark theme tokens
    views/
      Configs.tsx       # view 1: config_stats table
      Trend.tsx         # view 2: per-commit line + sd band
      TileSweep.tsx     # view 3: m×n heatmap with k selector
      RunDetail.tsx     # view 4: single run + samples strip plot
    components/
      FilterBar.tsx     # device / branch / driver_ver selectors (views 1–3)
      EChart.tsx        # ~30-line ECharts React wrapper (init/setOption/resize/dispose)
```

## Decisions

1. **Serving model: Bun fullstack `Bun.serve` with HTML imports.** `server.ts` imports
   `index.html` and passes it in `routes`, letting Bun bundle React/TSX and CSS in the
   same process that answers `/api/*` — this is the Bun-native way to get "one command,
   one process" with no separate build step. Tailwind v4 comes in via
   `bun-plugin-tailwind` registered in `bunfig.toml`. *Alternative considered:* explicit
   `bun build` into `dist/` plus a static-file handler — more moving parts and a stale-
   build failure mode; keep it as the fallback if the Tailwind plugin misbehaves, and per
   the brief ask the user before ever reaching for Vite.

2. **DB layer: one `db.ts` module, prepared statements, shared filter builder.** A single
   helper composes `WHERE` fragments for device/branch/driver_ver and the
   `excluded`-unless-`include_excluded=1` rule, with all values bound as parameters
   (defense in depth even though the DB is read-only and local). *Alternative:* per-
   endpoint ad-hoc SQL — rejected because the exclusion rule must be uniform across all
   five endpoints and drift there is exactly the kind of bug that fakes benchmark
   conclusions.

3. **Trend ordering: first-seen timestamp subquery.** `GROUP BY commit_hash` joined with
   `MIN(<ts column>)` per commit, `ORDER BY` that min ascending. Exact timestamp column
   name comes from the real `schema.sql` at implementation start.

4. **Tile sweep: `json_extract` in SQL, pivot in the client.** The endpoint returns flat
   `(m, n, k, mean, n_runs)` rows filtered to `tiles IS NOT NULL`; the frontend derives
   the k selector options and pivots m×n into the ECharts heatmap matrix. Keeps SQL
   simple and lets one response drive both the selector and the grid.

5. **Routing and state: hash router + React state, no libraries.** Views are hash routes
   (`#/configs`, `#/trend`, `#/tiles`, `#/run/:id`) so run-detail links are shareable;
   global filters live in a top-level context provider. Data fetching is a small
   `useFetch` hook over plain `fetch` — TanStack Query is permitted "at most" but adds
   nothing at this scale. *Alternative:* react-router — rejected as an unnecessary dep
   for four routes.

6. **ECharts integration: tiny custom wrapper, tree-shaken imports.** `EChart.tsx` wraps
   init/setOption/resize/dispose (~30 lines); import only the needed charts/components
   from `echarts/core` to keep the bundle lean. *Alternative:* `echarts-for-react` —
   rejected; the wrapper is smaller than the dependency's issue surface. Animations are
   globally disabled (`animation: false`) per the style requirement.

7. **Database path selection: `--db <path>` flag (default `./runs.db`).** This is how
   the dashboard points at `seed.db` for demos without any risk of the seed script
   touching real data. The server errors out clearly (naming the path and the seed
   script) if the file is missing, rather than letting SQLite create an empty DB —
   readonly open makes this the natural behavior anyway.

8. **Seed script: self-contained DDL, explicit target.** `seed.ts` embeds the schema
   (copied verbatim from the real `schema.sql` when it exists, including the
   `config_stats` view) and writes to its CLI-argument path, default `seed.db`. It
   hard-refuses a target named `runs.db` unless the path was passed explicitly, and is
   wired to no other script or lifecycle hook. Fake data is shaped per the seed-data
   spec: ~200 rows, 2 devices, 3+ commits, a tile sweep, at least one under-sampled and
   one noisy config, ≥1 excluded row, gaussian-ish samples arrays with occasional
   outliers.

## Risks / Trade-offs

- [Real `schema.sql` may differ from the brief's column list] → Implementation task 1 is
  reading it and reconciling names before any SQL is frozen; queries live in one file
  (`db.ts`) so renames are one-file fixes. If it still doesn't exist then, build against
  the brief's columns, ship the DDL inside `seed.ts`, and flag the assumption to the user.
- [Bun HTML-import + Tailwind plugin path is newer and could break] → Fallback is the
  explicit `bun build` + static serving variant (still Bun-only, still one command); Vite
  only with the user's explicit OK, per the brief.
- [`config_stats` may aggregate only one metric while the trend view needs both] → The
  trend endpoint aggregates from the raw runs table directly and does not depend on the
  view; only view 1 consumes `config_stats`.
- [ECharts full import bloats the bundle] → Tree-shaken `echarts/core` imports; only
  line, heatmap, and scatter modules are registered.
- [Heatmap cells with n=1 look as authoritative as n=10] → Cell tooltip always shows n
  (spec'd); consider rendering n in the cell label if it stays readable.

## Open Questions

None blocking. Deferred detail: exact timestamp column name and `config_stats` column
naming — resolved by reading the real `schema.sql` at implementation start without
affecting specs or task breakdown.
