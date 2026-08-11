# Proposal: add-compare-view

## Why

The dashboard can show one slice at a time (one device+branch trend, one commit's tile
sweep), but the questions that actually drive benchmarking decisions are comparative:
"on this device and the stable 1.3 branch, what is prefill tok/s for 1B/3B/8B e2e — and
how does that compare to the dev branch?", or "same 1B model, same dev branch — how do
devices or driver versions compare?". Answering these today means flipping filters back
and forth and remembering numbers.

## What Changes

- New **compare view** (fifth tab): pick a metric (decode / prefill / e2e tok/s), an
  x-axis dimension, an optional series dimension, and fix the remaining dimensions with
  filters. Supported dimensions: **model** (from params JSON), **branch**, **device**,
  **driver version**. Renders grouped bars with sd error bars plus a compact numbers
  table.
- **Aggregation semantics: latest commit per side.** Each compared cell is represented
  by the runs of the most recent commit within that cell's group (not pooled across the
  branch's history); the cell reports that commit hash and n.
- New `GET /api/compare` endpoint implementing the grouping; `/api/meta` gains the
  distinct model list.
- **shadcn/ui** enters the stack: the compare view's controls are built from shadcn
  components, and the shared chrome (global filter bar, header controls) is migrated to
  shadcn. Existing views (configs, trend, tiles, run detail) keep their current markup.
- Seed dataset extended so every compare dimension is demonstrable: a second branch
  (stable release/1.3), 3B and 8B models, and a second driver version — still ~deterministic,
  still opt-in, still never touching `runs.db`.
- **TanStack Query** replaces the hand-rolled `useFetch` hook for data fetching
  (caching makes flipping between comparisons instant; pre-authorized by the original
  brief's "plain fetch or TanStack Query at most"). Charts stay on ECharts — Recharts
  was considered at the user's prompt and rejected again for the same reason as the
  original brief: the heatmap and distribution plots are already built and Recharts
  handles those poorly.

**Assumptions recorded:**

- Model identity comes from `json_extract(params, '$.model')` (e.g. `llama3_2_1b`);
  short labels (1B/3B/8B) are derived for display. If the real harness uses a different
  key, it is a one-line change in the compare SQL.
- "M51" in the request is read as an example device name, not a device to hard-code;
  device values come from the data.
- Series colors use the first categorical palette slots (validated); if a series
  dimension has more than 8 values the extras fold into an "other" note rather than
  generating new hues.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

All three deltas are pure ADDED requirements (new concerns; no existing requirement's
behavior changes). Note: the `add-benchmark-dashboard` change that introduced these
capabilities is complete but not yet archived, so main specs do not exist yet — archive
that change before or together with this one.

- `benchmark-api`: ADD compare endpoint (latest-commit-per-cell aggregation over a
  chosen x/series dimension pair) and models in `/api/meta`.
- `dashboard-ui`: ADD compare view and shadcn/ui adoption for the new view + shared
  controls.
- `seed-data`: ADD compare-dimension coverage requirement (second branch, 3B/8B models,
  second driver version).

## Impact

- New code: `src/views/Compare.tsx`, `src/components/ui/*` (shadcn), compare query in
  `db.ts`, route in `server.ts`, seed additions in `seed.ts`.
- New dependencies: shadcn/ui components (source-copied) and their Radix UI primitives;
  `components.json` + tsconfig path alias; `@tanstack/react-query` (replaces the
  `useFetch` hook internals — call sites keep working or migrate trivially). Tailwind
  stays v4; Bun stays the only runtime/bundler; charts stay ECharts.
- Existing views untouched except the shared filter bar / header, which are rebuilt with
  shadcn components (same behavior).
- Playwright suite grows to cover the compare view.
