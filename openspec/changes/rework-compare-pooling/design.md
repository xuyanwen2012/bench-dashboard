# Design: rework-compare-pooling

## Context

See proposal.md — Why. Relevant current state:

- `db.ts:compare()` groups by (x, s, commit) in SQL, then reduces to the latest
  commit per (x, s) in JS. Filters go through the shared `where()` builder;
  dimension names are allow-listed in `DIMENSIONS`.
- `Compare.tsx` keeps criteria in the `#/compare?…` query (metric, x, series,
  fixed dims), fetches one `/api/compare` request, and renders a single ECharts
  grid with custom-series sd whiskers. The whisker `renderItem` computes bar
  positions from the axis band via `api.size()`.
- `meta.e2e.combos` already carries the distinct (device, branch, driver_ver,
  model) tuples — added for facet-style narrowing in the filter bar — which is
  exactly what the no-pooling check needs.
- Device already defaults to the primary benchmarking device, so the common
  entry state will not be blocked.

## Goals / Non-Goals

**Goals:**

- One `/api/compare` request per view state, faceting done server-side.
- The blocked state must be impossible to reach silently — no chart may render
  from pooled data.
- Keep bookmarkability: the URL fully determines the view.

**Non-Goals:**

- No changes to other views, the trend shift-marking, or the filter bar.
- No generalized "facet by any dimension" UI — the facet is always `model`
  (the API is generic, the UI is not).
- No commit-alignment across panels (each facet cell keeps its own latest
  commit; showing cross-model commit skew is the table's job via the commit
  column).

## Decisions

**1. Server-side `facet` param over N client requests.**
One request keeps latest-commit reduction in one place (`db.ts`) and avoids
waterfall/partial-render states. The SQL change is one extra grouping
expression; the JS reduction key becomes `facet|x|s`. Alternative — the client
issuing one request per model with `model` fixed — was rejected: it duplicates
the reduction semantics client-side and makes the table assembly stitch N
responses.

**2. API facet is dimension-generic; the UI only ever sends `facet=model`.**
The allow-list already exists (`DIMENSIONS`); restricting the param to `model`
would be more code, not less. Validation mirrors `series`: allow-listed and
distinct from `x` and `series`.

**3. Faceting is implicit, not a URL param.**
`model` absent from the query while off-axis ⇒ faceted. This keeps old
bookmarks working (they gain panels instead of showing pooled garbage — the
desired reinterpretation) and adds no new criteria state. The model fixed-value
selector's empty choice is relabeled from "none" to "all (faceted)".

**4. Small multiples as one ECharts instance with multiple grids.**
One `option` with `grid[i]`/`xAxis[i]`/`yAxis[i]` per model and each series
bound via `xAxisIndex`/`yAxisIndex`, rather than N `<EChart>` components.
Shared legend, single tooltip config, and one resize observer come free; the
existing whisker `renderItem` already computes positions from `api.coord`/
`api.size`, which are grid-relative, so it ports with only the axis-index
wiring. Panels lay out horizontally (3 models max today) with a per-panel
title showing the model label; each panel gets its own y-scale (a 1B vs 8B
shared scale would flatten the 8B bars into unreadability).

**5. No-pooling check runs on meta combos, filtered by fixed dims.**
For each dimension d ∉ {x, series, model-when-faceted} without a fixed value:
count distinct d values among `meta.e2e.combos` rows matching all currently
fixed values. >1 ⇒ blocked, listing each offending dimension with its
co-occurring values so the user can pick one inline. Checking global
`meta.e2e.<dim>s` lists (what the current "pooled" warning does) would block
spuriously — e.g. driver_ver has one value per device, so fixing the device
must unblock driver. When blocked, the view suppresses the fetch entirely
(`useFetch` gated on validity) — the API stays permissive, the UI is the
gate.

**6. `CompareCell` gains `facet: string | null`.**
Mirrors the existing `series: string | null` convention (null when the param
was not sent). Table shows a model column iff faceted; row order is model-size,
then the existing x/series sort.

## Risks / Trade-offs

- [Whisker geometry regresses on multi-grid] → the custom renderItem math is
  the trickiest port; verify against seed.db in both themes, with and without a
  series dimension.
- [Blocked state annoys drive-by exploration] → the block message includes the
  co-occurring values as one-click fixes; device defaulting already covers the
  common path.
- [Old pooled bookmarks change meaning] → intended: they now render faceted
  panels instead of wrong numbers. No redirect needed since criteria names are
  unchanged.
- [A future 4th model crowds horizontal panels] → panels wrap via the grid
  layout math; acceptable until real data shows otherwise.

## Migration Plan

Pure additive API change plus a UI rework behind the same route; ship in one
commit. Rollback = revert. No data or harness migration.
