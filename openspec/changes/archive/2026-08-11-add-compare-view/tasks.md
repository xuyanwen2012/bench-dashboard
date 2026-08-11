# Tasks: add-compare-view

## 1. Stack additions

- [x] 1.1 shadcn/ui setup: tsconfig `@/*` path alias, `bunx shadcn@latest init`
      (Tailwind v4, `.dark` class strategy) or manual `components.json` + component
      copy if the CLI balks at the Bun setup; pull `select`, `card`, `table`,
      `checkbox`, `button`, `tabs`, `tooltip`; define shadcn CSS vars from the existing
      palette hexes in `styles.css` (both light and `.dark` scopes, one paired block);
      verify a shadcn Button renders correctly in both themes.
- [x] 1.2 TanStack Query: add `@tanstack/react-query`, wrap the app in
      `QueryClientProvider`, reimplement `useFetch` over `useQuery` with the same
      `{ data, error, loading }` return shape; verify existing views still pass the
      Playwright suite unchanged.

## 2. Seed extension (compare dimensions)

- [x] 2.1 Extend `seed.ts` per the seed-data delta: `release/1.3` branch (2 commits,
      ~4% slower) on both devices; `llama3_2_3b` + `llama3_1_8b` on the S24+ only
      (8B absent on Pixel 7a); second driver version `r54p2` on the Pixel 7a at the
      same tip commit; keep determinism. Reseed and sanity-check counts and the
      distinct value sets with queries.

## 3. Backend

- [x] 3.1 `/api/meta`: add distinct `models` (from `json_extract(params,'$.model')`).
- [x] 3.2 `db.ts` compare query: allow-listed dimension→SQL map, latest-commit-per-cell
      (greatest-per-group on first-seen ts), mean/sd/n of decode/prefill/e2e per cell;
      `GET /api/compare` route with 400s for missing/invalid `metric`/`x`/`series`.
- [x] 3.3 Curl verification against the extended seed: model×branch prefill comparison
      (matches manual SQL for one cell), latest-commit-only semantics (older commit's
      runs excluded from a cell), empty 8B-on-Pixel cell absent, invalid dimension →
      400, `include_excluded=1` honored.

## 4. Compare view

- [x] 4.1 `src/views/Compare.tsx` skeleton + route/tab: criteria panel in shadcn Card —
      metric, x dimension, series dimension (incl. "none"), fixed-value Selects for
      remaining dimensions (concrete defaults, "any" allowed with pooling hint);
      criteria persisted in the hash query string; global filter bar hidden on this tab.
- [x] 4.2 Grouped bar chart: one ECharts bar series per series value (categorical
      palette slots, legend, zero baseline, null for missing cells), ±sd whiskers via
      custom series, tooltip with commit hash / n / mean ± sd; direct value labels when
      a light-mode series color is low-contrast (relief rule).
- [x] 4.3 Numbers table under the chart (shadcn Table): per cell commit short hash, n,
      mean, sd, CoV%; blank rows for empty cells.
- [x] 4.4 Migrate shared chrome to shadcn: FilterBar Selects and header theme/tab
      controls; behavior identical (verify with existing Playwright assertions).

## 5. Verification

- [x] 5.1 Extend the Playwright suite: canonical question 1 (fix device, x=model,
      series=branch, metric=prefill → both branches' bars for 1B/3B/8B, table shows
      commit+n), canonical question 2 (fix model+branch, x=device then x=driver_ver),
      empty-cell check (8B row blank for Pixel), instant back-flip via Query cache
      (no loading state on return), theme toggle restyles shadcn + compare chart.
- [x] 5.2 Full suite green in both themes; eyeball screenshots (light + dark) of the
      compare view; update README (compare view, shadcn, TanStack Query) and confirm
      no write statements outside `seed.ts`.
