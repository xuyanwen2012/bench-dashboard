## MODIFIED Requirements

### Requirement: Compare view

The dashboard SHALL provide a compare view (own tab/route) where the user selects: a
metric (decode / prefill / e2e tok/s), an x-axis dimension, an optional series
dimension, and fixed values for the remaining dimensions (model, branch, device,
driver_ver). It SHALL render the comparison as grouped bars — x-axis groups by the x
dimension, bar color by the series dimension — with sd error bars, and a compact table
of the same numbers (per cell: commit short hash, n, mean, sd, CoV%). Hovering a bar
SHALL show the cell's commit hash, n, mean ± sd. Series identity SHALL use the
categorical palette in fixed slot order with a legend; the x, series, and facet
dimensions SHALL never coincide.

The view SHALL never aggregate runs across distinct values of any dimension:

- **Model faceting.** When `model` is not the x dimension, not the series dimension,
  and not fixed to a single value, the view SHALL render small multiples: one chart
  panel per model that has matching runs, each with its own y-axis scale, sharing the
  x/series structure and a single legend, ordered by model size. The numbers table
  SHALL gain a model column in this mode. Fixing model to a single value collapses the
  view back to one panel.
- **No pooling of other dimensions.** When any other dimension (`device`, `branch`,
  `driver_ver`) is neither an axis nor fixed, and more than one of its values co-occurs
  with the currently fixed selections (per the meta combos), the view SHALL NOT render
  the chart or table; it SHALL instead show a message naming the offending dimension(s)
  and asking the user to fix a value or use it as an axis. A dimension with only one
  co-occurring value SHALL NOT block (it cannot pool anything).

Comparison criteria (metric, axes, fixed values) SHALL remain URL-addressable so
comparisons stay bookmarkable; a missing model criterion with model off-axis means
"faceted by model".

#### Scenario: Branch comparison never averages models

- **WHEN** the user picks x=branch with device fixed and model unfixed
- **THEN** one panel per model renders (each with its own y-scale and only that model's
  runs), and no bar anywhere aggregates runs from more than one model

#### Scenario: Branch-vs-branch across models

- **WHEN** the user fixes device, picks metric=prefill, x=model, series=branch
- **THEN** grouped bars show each model's prefill tok/s with one colored bar per branch,
  error bars from sd, and the table lists each cell's commit, n, mean, sd, CoV%

#### Scenario: Unfixed dimension blocks instead of pooling

- **WHEN** the user picks x=branch with model fixed but device unfixed, and runs exist
  on more than one device for the fixed selections
- **THEN** no chart renders; a message names `device` and offers fixing it or using it
  as an axis

#### Scenario: Single co-occurring value does not block

- **WHEN** driver_ver is unfixed but only one driver value co-occurs with the fixed
  device
- **THEN** the chart renders normally (driver cannot pool)

#### Scenario: Device comparison

- **WHEN** the user fixes model and branch and picks x=device (no series)
- **THEN** one bar per device renders with sd error bars

#### Scenario: Empty cells are honest

- **WHEN** a dimension combination has no runs (e.g. 8B on a device it does not fit)
- **THEN** the cell is absent/blank rather than shown as zero; a model with no matching
  runs gets no panel rather than an empty one
