# Design: add-compare-view

## Context

See `proposal.md` — Why. Builds on the shipped dashboard (Bun fullstack serve, readonly
`bun:sqlite`, React + Tailwind v4, ECharts, hash router, light/dark token system).
User decisions locked in: shadcn/ui for the new view + shared controls (not a full
restyle), latest-commit-per-side aggregation, all four dimensions (model, branch,
device, driver_ver), TanStack Query in, Recharts out.

## Goals / Non-Goals

**Goals:**

- One new endpoint + one new view that answer the two canonical questions (branch A vs
  B across models; device/driver comparison at fixed model+branch) in two or three
  clicks.
- shadcn adoption that coexists with the existing token system — one theme toggle keeps
  working everywhere.
- Comparisons must be honest: latest-commit-per-cell, visible commit hash and n, empty
  cells stay empty.

**Non-Goals:**

- No restyle of configs/trend/tiles/run-detail internals.
- No arbitrary N-dimension pivoting — exactly one x dimension and at most one series
  dimension.
- No statistical testing (t-tests, confidence intervals); mean ± sd and n only.

## Decisions

1. **Compare SQL: two-pass over an allow-listed dimension map.** Dimensions map to SQL
   expressions in code (`model → json_extract(params,'$.model')`, others are plain
   columns); `x`/`series`/filter names are validated against this map, values are always
   bound parameters. Pass 1 finds, per (x, series) cell, the commit with the max
   first-seen ts (`GROUP BY xExpr, seriesExpr, commit_hash` + window or a
   greatest-per-group join); pass 2 aggregates mean/sd/n of the chosen metric over that
   commit's rows. Metric expressions reuse the existing decode/prefill columns and the
   e2e derivation already in `db.ts`. *Alternative:* pooling all commits — rejected by
   user decision (smears history).

2. **shadcn/ui via CLI init, themed onto the existing tokens.** `bunx shadcn@latest
   init` with Tailwind v4 + the `.dark` class strategy (matches our toggle), tsconfig
   `@/*` path alias (Bun resolves tsconfig paths natively). shadcn's CSS variables
   (`--background`, `--foreground`, `--border`, …) are defined from the same palette
   values as our `--page`/`--ink`/`--edge` tokens in `styles.css`, both scopes, so one
   `.dark` flip drives both systems. Components pulled: `select`, `card`, `table`,
   `checkbox`, `button`, `tabs`, `tooltip`. The global FilterBar and header buttons are
   rebuilt on shadcn `Select`/`Button`; behavior (including the "any" empty value and
   shared state) unchanged. *Alternative:* hand-rolled listboxes — rejected, user asked
   for shadcn.

3. **Grouped bars + error bars in ECharts.** One `bar` series per series-dimension
   value (categorical palette slots in fixed order — grouped bars are the adjacent-pair
   case, validated for the reference palette; ≥ 4 series also get direct value labels
   per the light-mode contrast relief rule), plus one `custom` series per bar series
   drawing the ±sd whiskers at the bars' offset positions. Bars start at zero (magnitude
   encoding); rounded 4px top corners, 2px gap between adjacent bars. Missing cells get
   `null` values so ECharts leaves gaps instead of zero bars. *Alternative:* Recharts
   (has built-in ErrorBar) — rejected: two chart libraries, and the rest of the
   dashboard is ECharts.

4. **TanStack Query behind the existing hook shape.** `useFetch(url)` is reimplemented
   as a thin wrapper over `useQuery({ queryKey: [url], queryFn })` returning the same
   `{ data, error, loading }` shape — zero call-site churn in existing views; the
   compare view uses it the same way. `QueryClientProvider` wraps the app;
   `staleTime` a few seconds so back-flips are instant but data stays fresh.
   *Alternative:* per-view manual caching — that's just reinventing Query.

5. **Compare view owns its criteria; global filter bar hidden on this tab.** The
   canonical questions fix dimensions the global bar doesn't cover (model) and reassign
   others as axes; sharing state with the bar would make "which filter is active"
   ambiguous. The view's criteria panel (shadcn Selects in a Card) is: metric ·
   x dimension · series dimension (or none) · one fixed-value Select per remaining
   dimension ("any" allowed, with the caveat that "any" pools across that dimension
   within a cell — displayed as a hint). Criteria encode into the hash query string so
   comparisons are shareable/bookmarkable.

6. **Seed extension, deterministic.** Added on top of the existing dataset: stable
   branch `release/1.3` on both devices (2 commits, ~4% slower than dev tip), models
   `llama3_2_3b` and `llama3_1_8b` on the S24+ (~0.45× and ~0.18× the 1B decode rate;
   8B deliberately absent on the Pixel 7a for the empty-cell scenario), and a second
   driver version on the Pixel 7a (older `r54p2`, ~3% slower, older commit only — no:
   same tip commit so the driver comparison is apples-to-apples). Row count lands
   ~320.

## Risks / Trade-offs

- [shadcn CLI may fight the no-Vite Bun setup] → shadcn components are just source
  files + Radix deps; if the CLI's framework detection balks, add `components.json`
  and copy component sources manually — no build-system change either way.
- [Two theming systems (our tokens + shadcn vars) drifting] → both defined in one
  `styles.css` block from the same hex values; a comment marks them as a paired set.
- ["any" on a fixed dimension silently pools heterogeneous runs] → the criteria panel
  shows an explicit "pooled across N <dimension> values" hint on cells whose group had
  more than one value; default fixed values are concrete, not "any".
- [Latest-commit-per-cell can compare different commits across sides] → that is the
  point (each side's best current state), but the table always shows each cell's commit
  hash so it is never hidden.
- [ECharts custom-series error bars are fiddly] → the whisker renderer is ~30 lines and
  positions via the bar layout API; fallback is capped-line `markLine`s, worst case
  drop whiskers and keep sd in tooltip + table (table always has sd regardless).

## Open Questions

None blocking. The exact params key for model (`$.model`) is confirmed against the real
`schema.sql`/data when it lands, same as the existing timestamp-column caveat.
