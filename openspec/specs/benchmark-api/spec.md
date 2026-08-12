# benchmark-api Specification

## Purpose

Read-only local HTTP JSON API over the benchmark results database (`runs.db`), giving the
dashboard UI queryable access to config statistics, individual runs, per-commit trends,
and tile-sweep aggregates without ever writing to the database.

## Requirements

### Requirement: Read-only database access

The API server SHALL open `runs.db` in read-only mode and SHALL NOT execute any statement
that modifies the database (no INSERT/UPDATE/DELETE/DDL). The database schema is owned by
the external Python harness and SHALL NOT be created or altered by the dashboard.

#### Scenario: Database opened read-only

- **WHEN** the server starts with an existing `runs.db`
- **THEN** the database is opened with a read-only flag, and any write attempted through
  the connection would fail at the SQLite level

#### Scenario: Database missing

- **WHEN** the server starts and the configured database file does not exist
- **THEN** the server exits (or responds to API calls) with a clear error message naming
  the missing path and mentioning the seed script as a way to produce demo data, rather
  than silently creating an empty database

### Requirement: Localhost-only binding

The server SHALL bind to a loopback address only (localhost), and SHALL serve both the
JSON API and the built frontend assets from that single process and port.

#### Scenario: Not reachable from the network

- **WHEN** the server is running
- **THEN** it listens on 127.0.0.1 (or ::1) only, and a request to the host's external
  interface address is refused

#### Scenario: One process serves everything

- **WHEN** the user runs the single dashboard command
- **THEN** the same process answers both `/api/*` requests and requests for the frontend
  page and assets

### Requirement: Excluded-row semantics

Every API query SHALL exclude rows where `excluded = 1` by default. When the request
carries `?include_excluded=1`, excluded rows SHALL be included.

#### Scenario: Default excludes

- **WHEN** `/api/runs?config_hash=X` is requested and the config has runs with
  `excluded = 1`
- **THEN** those rows are absent from the response

#### Scenario: Opt-in include

- **WHEN** the same request adds `&include_excluded=1`
- **THEN** excluded rows appear in the response

### Requirement: Configs endpoint

`GET /api/configs` SHALL return the rows of the `config_stats` view (per-config n,
mean_tps, sd_tps, cov_pct plus identifying columns), filterable by optional `device`,
`branch`, and `driver_ver` query parameters (exact match, combinable).

#### Scenario: Unfiltered

- **WHEN** `/api/configs` is requested
- **THEN** all config_stats rows are returned as JSON

#### Scenario: Filtered

- **WHEN** `/api/configs?device=D&branch=B` is requested
- **THEN** only rows matching both device D and branch B are returned

### Requirement: Runs-per-config endpoint

`GET /api/runs?config_hash=<hash>` SHALL return all runs for that config (subject to
excluded-row semantics). A missing `config_hash` parameter SHALL produce a 400 response
with an error message.

#### Scenario: Runs for a config

- **WHEN** `/api/runs?config_hash=X` is requested for a config with runs
- **THEN** each matching run row is returned, including at least id, repeat_idx,
  decode_tps, prefill_tps, thermal fields, and excluded flag

#### Scenario: Missing parameter

- **WHEN** `/api/runs` is requested without `config_hash`
- **THEN** the response is HTTP 400 with a JSON error body

### Requirement: Single-run endpoint

`GET /api/run/:id` SHALL return the full row for one run, with JSON columns (`params`,
`tiles`, `samples`) parsed into JSON values in the response. An unknown id SHALL produce
a 404 response.

#### Scenario: Existing run

- **WHEN** `/api/run/42` is requested and run 42 exists
- **THEN** the complete row is returned and `samples` is a JSON array, not a string

#### Scenario: Unknown run

- **WHEN** `/api/run/999999` is requested and no such row exists
- **THEN** the response is HTTP 404 with a JSON error body

### Requirement: Trend endpoint

`GET /api/trend?device=<d>&branch=<b>` SHALL return per-commit aggregates — for each
commit: mean, standard deviation, and n of decode_tps, prefill_tps, and the derived
e2e tok/s (`3072 / (2048/prefill_tps + 1024/decode_tps)`, computed per run before
aggregating) — ordered by the first-seen timestamp of each commit (chronological commit
order as observed in the data, not hash order).

#### Scenario: Trend for device and branch

- **WHEN** `/api/trend?device=D&branch=B` is requested
- **THEN** one entry per distinct commit_hash matching D and B is returned, each with
  mean/sd/n for decode_tps and prefill_tps, sorted by that commit's earliest run
  timestamp ascending

### Requirement: Tile-sweep endpoint

`GET /api/tilesweep?commit=<c>&device=<d>` SHALL return decode_tps aggregates (mean and
n) grouped by the tile dimensions extracted from the `tiles` JSON column
(`$.m`, `$.n`, `$.k`).

#### Scenario: Sweep aggregates

- **WHEN** `/api/tilesweep?commit=C&device=D` is requested
- **THEN** each returned entry carries tile m, n, k values and the mean decode_tps and
  count of the non-excluded runs in that (m, n, k) group

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
facetless request keeps its prior cells keyed by x and series only. The e2e metric is
the derived per-run value defined by the dashboard's standard run shape. Excluded-row
semantics follow the global rule.

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

### Requirement: Models in meta

`GET /api/meta` SHALL include the distinct model values (from the params JSON) present
in the database, so the UI can populate model selectors without a separate query.

#### Scenario: Models listed

- **WHEN** `/api/meta` is requested against a database with 1B and 3B runs
- **THEN** the response includes both model identifiers
