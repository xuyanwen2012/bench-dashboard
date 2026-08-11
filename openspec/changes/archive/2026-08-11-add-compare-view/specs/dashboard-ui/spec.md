# Delta Spec: dashboard-ui (add-compare-view)

## ADDED Requirements

### Requirement: Compare view

The dashboard SHALL provide a compare view (own tab/route) where the user selects: a
metric (decode / prefill / e2e tok/s), an x-axis dimension, an optional series
dimension, and fixed values for the remaining dimensions (model, branch, device,
driver_ver). It SHALL render the comparison as grouped bars — x-axis groups by the x
dimension, bar color by the series dimension — with sd error bars, and a compact table
of the same numbers (per cell: commit short hash, n, mean, sd, CoV%). Hovering a bar
SHALL show the cell's commit hash, n, mean ± sd. Series identity SHALL use the
categorical palette in fixed slot order with a legend; the x and series dimensions
SHALL never be the same dimension.

#### Scenario: Branch-vs-branch across models

- **WHEN** the user fixes device, picks metric=prefill, x=model, series=branch
- **THEN** grouped bars show each model's prefill tok/s with one colored bar per branch,
  error bars from sd, and the table lists each cell's commit, n, mean, sd, CoV%

#### Scenario: Device comparison

- **WHEN** the user fixes model and branch and picks x=device (no series)
- **THEN** one bar per device renders with sd error bars

#### Scenario: Empty cells are honest

- **WHEN** a dimension combination has no runs (e.g. 8B on a device it does not fit)
- **THEN** the cell is absent/blank rather than shown as zero

### Requirement: shadcn/ui for compare view and shared controls

The compare view's controls SHALL be built from shadcn/ui components, and the shared
chrome (global filter bar selectors, header controls) SHALL be migrated to shadcn/ui
equivalents with unchanged behavior. Existing views' internal markup is out of scope.
shadcn theming SHALL be wired to the existing light/dark token system so the theme
toggle continues to restyle everything.

#### Scenario: Shared controls migrated

- **WHEN** any of views 1–3 renders after this change
- **THEN** the global filter bar uses shadcn select components and behaves as before
  (including the "any" option and shared-across-views state)

#### Scenario: Theme toggle still restyles

- **WHEN** the user toggles dark mode on the compare view
- **THEN** shadcn components and the compare chart both re-style to the dark tokens

### Requirement: Query caching for view flips

Data fetching SHALL go through a query-caching layer (TanStack Query) so that returning
to a previously viewed comparison or view renders from cache without a visible reload,
while still refetching stale data in the background.

#### Scenario: Instant back-flip

- **WHEN** the user switches from comparison A to comparison B and back to A
- **THEN** A renders immediately from cache (no loading state) and refreshes silently
