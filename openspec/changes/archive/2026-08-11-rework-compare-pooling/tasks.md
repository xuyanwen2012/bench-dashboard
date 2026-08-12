## 1. API: facet dimension

- [x] 1.1 `db.ts` — extend `compare()` with an optional `facet` dimension: add the
      facet expression to the SELECT/GROUP BY, key the latest-commit reduction by
      `facet|x|s`, include `facet` (value or null) in returned cells, and sort
      facet-first
- [x] 1.2 `server.ts` — validate `facet` on `/api/compare`: allow-listed in
      `DIMENSIONS`, distinct from `x` and `series`, 400 with JSON error otherwise;
      drop any fixed filter that collides with the facet dimension (same rule as
      the axes)
- [x] 1.3 `src/api.ts` — add `facet: string | null` to `CompareCell`
- [x] 1.4 Verify against seed.db with curl: faceted response groups per model with
      per-facet latest commits; facetless request byte-identical in shape to
      before; 400 cases (`facet=x`, unknown facet)

## 2. Compare view: no-pooling gate

- [x] 2.1 `Compare.tsx` — implement the co-occurrence check over
      `meta.e2e.combos`: for each non-axis, non-fixed dimension other than model,
      count distinct values among combos matching the fixed selections; >1 ⇒
      blocked
- [x] 2.2 Blocked state UI: suppress the fetch, render a message naming each
      offending dimension with its co-occurring values as one-click fix buttons
      (plus the hint that it can be an axis instead); remove the old
      "⚠ pooled across …" warning
- [x] 2.3 Relabel the model fixed-selector's empty option from "none" to
      "all (faceted)"

## 3. Compare view: model small multiples

- [x] 3.1 `Compare.tsx` — send `facet=model` when model is off-axis and unfixed;
      keep criteria/URL handling unchanged (absence of model = faceted)
- [x] 3.2 Build the multi-grid ECharts option: one grid/xAxis/yAxis per model with
      data (model-size order), per-panel title with the model label, per-panel
      y-scale, series wired via `xAxisIndex`/`yAxisIndex`, single shared legend
      and tooltip
- [x] 3.3 Port the sd-whisker custom series to the multi-grid layout (axis-index
      wiring on the existing `renderItem` math)
- [x] 3.4 Table: add a model column iff faceted; rows ordered model-size then
      x/series; single-panel path (model fixed or on-axis) renders exactly as
      today

## 4. Verify

- [x] 4.1 Manual pass against seed.db: x=branch faceted panels (the motivating
      case — dev-1.3 CoV now per-model), x=model unchanged, blocked-state for
      unfixed device, single-driver-per-device does not block, dark mode, empty
      cells/models absent not zero
- [x] 4.2 `bun run lint` and `bun run typecheck` pass clean
- [x] 4.3 Update README.md's compare-view paragraph (faceting, no-pooling rule)
