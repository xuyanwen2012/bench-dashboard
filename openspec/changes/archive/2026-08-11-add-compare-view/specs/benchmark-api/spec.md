# Delta Spec: benchmark-api (add-compare-view)

## ADDED Requirements

### Requirement: Compare endpoint

`GET /api/compare` SHALL return aggregated cells for a cross-dimension comparison. Query
parameters: `metric` (one of `decode`, `prefill`, `e2e`), `x` (x-axis dimension),
optional `series` (second dimension), plus fixed-value filters for any of the remaining
dimensions. Supported dimensions: `model` (extracted from the params JSON), `branch`,
`device`, `driver_ver`. For every (x value, series value) cell the endpoint SHALL apply
latest-commit-per-cell semantics: identify the most recent commit (by first-seen
timestamp) among the cell's matching runs, and aggregate only that commit's runs —
returning the commit hash, n, mean, and sd of the chosen metric. The e2e metric is the
derived per-run value defined by the dashboard's standard run shape. Excluded-row
semantics follow the global rule.

#### Scenario: Branch comparison across models

- **WHEN** `/api/compare?metric=prefill&x=model&series=branch&device=D` is requested
- **THEN** one cell per (model, branch) pair present on device D is returned, each
  aggregating only the latest commit's runs in that pair, with commit_hash, n, mean, sd

#### Scenario: Latest commit only

- **WHEN** a cell's group contains runs from an older and a newer commit
- **THEN** the cell's mean/sd/n cover only the newer commit's runs and the cell names
  that commit's hash

#### Scenario: Invalid dimension rejected

- **WHEN** `/api/compare?metric=decode&x=cmdline` is requested
- **THEN** the response is HTTP 400 with a JSON error body (dimension names are
  allow-listed, never interpolated from user input)

#### Scenario: Missing required parameters

- **WHEN** `/api/compare` is requested without `metric` or without `x`
- **THEN** the response is HTTP 400 with a JSON error body

### Requirement: Models in meta

`GET /api/meta` SHALL include the distinct model values (from the params JSON) present
in the database, so the UI can populate model selectors without a separate query.

#### Scenario: Models listed

- **WHEN** `/api/meta` is requested against a database with 1B and 3B runs
- **THEN** the response includes both model identifiers
