# Rework compare view: never pool across models (or any dimension)

## Why

The compare view is only trustworthy when `model` is the x-axis. For any other x
(e.g. `branch`), every cell silently averages all models matching the filters —
and since 1B/3B/8B differ by ~10× in tok/s, the pooled mean and CoV are
meaningless (dev-1.3 showing "very high CoV" is really just model mix, not noise).
The current guard is a small "⚠ pooled across …" note that is easy to miss and
does not make the numbers any less wrong. Models are effectively three separate
tests and must never be averaged together; the same is true of devices, branches,
and drivers.

## What Changes

- **Facet by model (small multiples).** When `model` is not the x-axis, not the
  series, and not fixed to a single value, the compare view renders one chart
  panel per model (own y-scale, shared x/series and legend, ordered by model
  size) instead of pooling models into one bar. The numbers table gains a model
  column in this mode.
- **Refuse pooling for every other dimension.** A non-axis, non-fixed dimension
  (`device`, `branch`, `driver_ver`) that has more than one value co-occurring
  with the current fixed selections blocks the chart with a prompt to fix it or
  make it an axis — replacing today's warn-and-pool behavior. The co-occurrence
  check uses the meta combos so a dimension with only one possible value under
  the current selection (e.g. one driver per device) never blocks spuriously.
- **`/api/compare` gains an optional `facet` dimension parameter.** Cells are
  additionally grouped by the facet value, and latest-commit-per-cell semantics
  apply per (facet, x, series) group. Facet is allow-listed like `x`/`series`
  and must differ from both. **BREAKING** for the previous implicit behavior:
  the UI no longer issues pooled requests, but the endpoint itself remains
  backward compatible (no `facet` = current shape).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `benchmark-api`: the Compare endpoint requirement gains the optional `facet`
  dimension — grouping, latest-commit reduction, and the returned cell shape
  change when it is present.
- `dashboard-ui`: the Compare view requirement is rewritten — model faceting as
  small multiples, no-pooling enforcement for all dimensions, and the removal of
  the warn-and-pool state.

## Impact

- `db.ts` — `compare()` query gains facet grouping; latest-commit reduction keyed
  by (facet, x, series).
- `server.ts` — `/api/compare` validates the new `facet` param.
- `src/views/Compare.tsx` — faceted small-multiples chart, blocking
  unfixed-dimension state, table model column, criteria/URL handling.
- `src/api.ts` — `CompareCell` type gains the facet field.
- No schema, seed, or harness impact; no new dependencies (ECharts grid layout
  handles small multiples).
