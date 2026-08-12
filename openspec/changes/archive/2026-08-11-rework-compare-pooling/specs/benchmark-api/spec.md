## MODIFIED Requirements

### Requirement: Compare endpoint

`GET /api/compare` SHALL return aggregated cells for a cross-dimension comparison. Query
parameters: `metric` (one of `decode`, `prefill`, `e2e`), `x` (x-axis dimension),
optional `series` (second dimension), optional `facet` (panel dimension), plus
fixed-value filters for any of the remaining dimensions. Supported dimensions: `model`
(extracted from the params JSON), `branch`, `device`, `driver_ver`. `x`, `series`, and
`facet` MUST name distinct dimensions; all three are allow-listed, never interpolated
from user input. For every (facet value, x value, series value) cell the endpoint SHALL
apply latest-commit-per-cell semantics: identify the most recent commit (by first-seen
timestamp) among the cell's matching runs, and aggregate only that commit's runs —
returning the facet value, the commit hash, n, mean, and sd of the chosen metric. The
facet field follows the series convention: null when the parameter was not sent, so a
facetless request keeps its prior cells keyed by x and series only. The e2e metric is the derived per-run
value defined by the dashboard's standard run shape. Excluded-row semantics follow the
global rule.

#### Scenario: Branch comparison faceted by model

- **WHEN** `/api/compare?metric=prefill&x=branch&facet=model&device=D` is requested
- **THEN** one cell per (model, branch) pair present on device D is returned, each
  carrying its model as the facet value and aggregating only the latest commit's runs
  in that (model, branch) pair — no cell ever mixes runs from different models

#### Scenario: Branch comparison across models

- **WHEN** `/api/compare?metric=prefill&x=model&series=branch&device=D` is requested
- **THEN** one cell per (model, branch) pair present on device D is returned, each
  aggregating only the latest commit's runs in that pair, with commit_hash, n, mean, sd

#### Scenario: Latest commit only

- **WHEN** a cell's group contains runs from an older and a newer commit
- **THEN** the cell's mean/sd/n cover only the newer commit's runs and the cell names
  that commit's hash

#### Scenario: Latest commit chosen per facet

- **WHEN** the same (x, series) group has a newer commit for model A than for model B
- **THEN** each model's cell uses its own latest commit; the reduction is per
  (facet, x, series), not per (x, series)

#### Scenario: Facet must differ from axes

- **WHEN** `/api/compare?metric=decode&x=model&facet=model` is requested
- **THEN** the response is HTTP 400 with a JSON error body

#### Scenario: Invalid dimension rejected

- **WHEN** `/api/compare?metric=decode&x=cmdline` is requested
- **THEN** the response is HTTP 400 with a JSON error body (dimension names are
  allow-listed, never interpolated from user input)

#### Scenario: Missing required parameters

- **WHEN** `/api/compare` is requested without `metric` or without `x`
- **THEN** the response is HTTP 400 with a JSON error body
