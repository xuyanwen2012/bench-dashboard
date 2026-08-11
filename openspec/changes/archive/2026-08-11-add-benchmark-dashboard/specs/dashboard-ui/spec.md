# Delta Spec: dashboard-ui

## Purpose

Browser UI for exploring benchmark results: a configs quality table, a per-commit trend
chart, a tile-sweep heatmap, and a single-run detail view, styled as a dense dark-theme
engineering tool and served by the same local process as the API.

## ADDED Requirements

### Requirement: Global filter bar

Views 1–3 (configs, trend, tile sweep) SHALL share a global filter bar with device,
branch, and driver_ver selectors. Changing a filter SHALL update the currently visible
view; the selection SHALL persist while switching among views 1–3.

#### Scenario: Filter applies across views

- **WHEN** the user selects a device in the filter bar on the configs view and switches
  to the trend view
- **THEN** the trend view reflects the same device selection without re-selecting it

### Requirement: Configs table view

The configs view SHALL list `config_stats` rows with columns: short commit hash, device,
driver_ver, n, mean, sd, and CoV%. It SHALL be sortable by cov_pct or mean_tps via a
toggle. Rows with n < 5 SHALL be visibly highlighted as "under-sampled" and rows with
CoV > 5% as "noisy". Clicking a row SHALL navigate to that config's run list, from which
individual runs open in the run detail view.

#### Scenario: Sort toggle

- **WHEN** the user toggles the sort control from CoV% to mean
- **THEN** rows reorder by mean_tps

#### Scenario: Quality highlighting

- **WHEN** a config has n = 3 and CoV = 7.2%
- **THEN** its row carries both the under-sampled and the noisy highlight

#### Scenario: Row click drills down

- **WHEN** the user clicks a config row
- **THEN** the UI shows that config's runs, and selecting one opens the run detail view

### Requirement: Trend view

The trend view SHALL plot per-commit means as lines for the selected device + branch,
with an error band derived from sd, as vertically stacked aligned panels — one panel per
metric (e2e, prefill, decode), each with its own value axis (never a dual-axis chart).
Checkboxes SHALL show or hide each metric's panel independently (all visible by
default); hiding decode is done by unchecking it. Hovering a point SHALL show the commit
hash, n, and CoV. Commits SHALL appear in first-seen chronological order.

#### Scenario: Hover detail

- **WHEN** the user hovers a commit point on a trend panel
- **THEN** a tooltip shows that commit's hash, n, and CoV for that panel's metric

#### Scenario: Hide decode

- **WHEN** the user unchecks the decode checkbox
- **THEN** the decode panel disappears and the remaining panels stay aligned

### Requirement: E2E throughput metric

The dashboard SHALL derive an end-to-end tok/s per run as total tokens divided by total
time using the standard run shape of 2048 prefill + 1024 decode tokens:
`3072 / (2048/prefill_tps + 1024/decode_tps)` (constants adjustable in one place). It
SHALL appear as a trend panel (per-commit mean ± sd), in the run detail view, and in the
per-config aggregate summary.

#### Scenario: E2E in trend

- **WHEN** the trend view loads with the e2e checkbox checked
- **THEN** an e2e tok/s panel renders with mean line and sd band per commit

### Requirement: Per-config aggregate summary

The config run-list view SHALL show, above the individual runs, aggregate statistics for
that config: n plus mean, sd, and CoV% for decode, prefill, and e2e tok/s, computed over
non-excluded runs.

#### Scenario: Summary shown

- **WHEN** the user opens a config's run list
- **THEN** a summary block shows n and mean/sd/CoV for decode, prefill, and e2e

### Requirement: Tile-sweep heatmap view

For a selected commit + device, the tile-sweep view SHALL render a heatmap of decode_tps
with tile m on the x axis and tile n on the y axis, and a selector for tile k. Hovering a
cell SHALL show that cell's mean decode_tps and n.

#### Scenario: k selector

- **WHEN** the user changes the k selector
- **THEN** the heatmap re-renders showing only groups with that k value

#### Scenario: Cell hover

- **WHEN** the user hovers a heatmap cell
- **THEN** a tooltip shows the cell's mean decode_tps and run count

### Requirement: Run detail view

The run detail view SHALL show the full row for one run: the cmdline in a copyable code
block, all metadata (config, session, commit/branch/dirty, device, driver, freq_pinned),
thermal fields (start/end temperature, battery), the parsed params and tiles, and the
`samples` array plotted as a strip/scatter chart showing per-iteration spread.

#### Scenario: Copyable cmdline

- **WHEN** the user activates the copy control on the cmdline block
- **THEN** the full cmdline text is placed on the clipboard

#### Scenario: Samples plotted

- **WHEN** a run's samples JSON contains per-iteration values
- **THEN** each iteration value is rendered as an individual point so outliers and drift
  across iterations are visible

### Requirement: Engineering-tool styling

The UI SHALL default to a light theme with a dark-theme toggle in the header (choice
persisted across reloads); tables SHALL be dense and compact; hashes and cmdlines SHALL
be rendered in a monospace font; the UI SHALL NOT use animations. Charts SHALL re-style
to the active theme.

#### Scenario: Light default, dark toggle

- **WHEN** the dashboard loads for the first time
- **THEN** it renders in the light theme; activating the header toggle switches the full
  UI including charts to dark, and the choice survives a reload

#### Scenario: Dense presentation

- **WHEN** any view renders
- **THEN** it uses compact row spacing, monospace for hashes and cmdlines, and no
  animated transitions

### Requirement: Single-command launch

Running `bun run dashboard` SHALL start the one process that serves both the API and the
built frontend, after which the four views are usable in a browser at the printed
localhost URL.

#### Scenario: One command

- **WHEN** the user runs `bun run dashboard` in the project directory
- **THEN** a localhost URL is printed and opening it shows the dashboard with live data
  from the configured database
