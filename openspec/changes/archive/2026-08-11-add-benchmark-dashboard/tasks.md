# Tasks: add-benchmark-dashboard

## 1. Schema reconciliation & scaffolding

- [x] 1.1 Look for the real `schema.sql` / `runs.db`; if present, read them and reconcile
      the brief's column list (timestamp column name, `config_stats` columns, exact JSON
      shapes) against `design.md`; note any differences before writing SQL. If absent,
      proceed on the brief's columns and tell the user which assumption is in effect.
- [x] 1.2 Init the flat Bun package: `package.json` (react, react-dom, tailwindcss,
      bun-plugin-tailwind, echarts; `"dashboard"` script), `bunfig.toml`, `index.html`,
      `src/styles.css`, empty `server.ts` — verify `bun install` and a hello-world
      `Bun.serve` on localhost boot cleanly.

## 2. Seed script (needed first — no real runs.db exists yet)

- [x] 2.1 Write `seed.ts`: embedded DDL (tables + `config_stats` view), explicit target
      path defaulting to `seed.db`, hard refusal to write `runs.db` unless that exact
      path is passed; no lifecycle-hook wiring anywhere.
- [x] 2.2 Generate the dataset per the seed-data spec: ~200 rows, 2 devices, 3+ commits
      on one device+branch, several configs × repeats including one n<5 config and one
      CoV>5% config, a tile sweep over multiple (m,n,k) for one commit+device, realistic
      samples arrays, ≥1 excluded row. Verify counts/shape with a few sqlite3 queries.

## 3. Backend API (verify each endpoint with curl against seed.db)

- [x] 3.1 Write `db.ts`: readonly open of the `--db` path (default `./runs.db`), clear
      missing-file error naming the path and the seed script, shared filter builder
      (device/branch/driver_ver + excluded-unless-`include_excluded=1`), all params bound.
- [x] 3.2 `GET /api/configs` with optional device/branch/driver_ver filters; curl:
      unfiltered, each filter, combined filters.
- [x] 3.3 `GET /api/runs?config_hash=` (400 without param) and `GET /api/run/:id`
      (404 unknown id; params/tiles/samples parsed to JSON values); curl all cases
      including `include_excluded=1` count difference.
- [x] 3.4 `GET /api/trend?device=&branch=` — per-commit mean/sd/n for decode_tps and
      prefill_tps ordered by first-seen timestamp; curl and eyeball ordering against
      seeded commit times.
- [x] 3.5 `GET /api/tilesweep?commit=&device=` — mean/n grouped by json_extract m/n/k,
      `tiles IS NOT NULL`; curl and cross-check one cell against a manual sqlite3 query.

## 4. Frontend shell

- [x] 4.1 Wire `server.ts` to serve the frontend via Bun HTML imports alongside `/api/*`
      (fall back to explicit `bun build` + static serving if the Tailwind plugin breaks;
      ask the user before considering Vite). `bun run dashboard` = the one command.
- [x] 4.2 `src/main.tsx`: hash router (`#/configs`, `#/trend`, `#/tiles`, `#/run/:id`),
      global filter context, `FilterBar` populated from distinct values, `api.ts` fetch
      helpers, dark/dense/monospace base styles, `EChart.tsx` wrapper with
      `animation: false`. Load the `dataviz` skill before writing any chart code.

## 5. Views (priority order; verify each in the browser against seed.db before the next)

- [x] 5.1 View 1 Configs table: cov_pct/mean_tps sort toggle, short-commit column,
      n<5 and CoV>5% highlights, row click → config's run list → run detail links.
- [x] 5.2 View 2 Trend: decode_tps line + sd band per commit for filtered device+branch,
      tooltip with commit hash/n/CoV, prefill toggle.
- [x] 5.3 View 3 Tile sweep: commit+device selectors, m×n heatmap, k selector, cell
      tooltip with mean and n.
- [x] 5.4 View 4 Run detail: full metadata, copyable cmdline code block, temps/battery,
      parsed params+tiles, samples strip/scatter plot.

## 6. Final verification

- [x] 6.1 End-to-end pass: fresh `bun install`, `bun run dashboard --db seed.db`, click
      through all four views and the filter bar; confirm server is unreachable from a
      non-loopback address and that no code path writes to the DB (grep for
      INSERT/UPDATE/DELETE outside `seed.ts`).
- [x] 6.2 Confirm `bun run dashboard` against a missing `runs.db` produces the helpful
      error (not an empty DB), and README-style usage notes land in `package.json`
      scripts or a short `README.md`.

## 7. Revisions (2026-08-11: light theme, e2e metric, panel toggles, config aggregates)

- [x] 7.1 Light theme default + dark toggle: semantic color tokens (CSS vars + Tailwind
      `@theme inline`), `.dark` class flip persisted in localStorage, chart token sets
      for both themes, heatmap cell-label contrast per theme.
- [x] 7.2 E2E tok/s metric: `3072 / (2048/prefill + 1024/decode)` (fixed constants) —
      per-commit mean/sd in `/api/trend`, field in run detail.
- [x] 7.3 Trend view: stacked aligned panels (e2e / prefill / decode), one axis each,
      checkboxes to show/hide each panel (decode hideable), default all visible.
- [x] 7.4 Config run list: aggregate summary above the table — n and mean/sd/CoV for
      decode, prefill, e2e over non-excluded runs.
- [x] 7.5 Update Playwright suite for the new behaviors; rerun full pass + eyeball
      screenshots in both themes.
