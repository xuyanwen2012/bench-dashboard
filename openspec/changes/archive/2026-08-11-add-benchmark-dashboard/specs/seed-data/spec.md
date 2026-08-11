# Delta Spec: seed-data

## Purpose

A standalone, opt-in seed script that fabricates a small but realistic benchmark dataset
in a separate database file, so every dashboard view is demonstrable when `runs.db` is
missing or empty — without ever touching real data automatically.

## ADDED Requirements

### Requirement: Separate opt-in script

Seeding SHALL be a separate script invoked explicitly by the user. It SHALL NOT run as a
side effect of starting the dashboard, installing dependencies, or any other command.

#### Scenario: Never auto-run

- **WHEN** the user runs `bun run dashboard` (or any install/build step) with a missing
  or empty database
- **THEN** no seed data is inserted anywhere; the dashboard reports the empty/missing
  database instead

### Requirement: Real database protected

The seed script SHALL write to an explicitly specified target file, defaulting to a
non-production filename (e.g. `seed.db`), and SHALL refuse to write to an existing
`runs.db` unless the user passes that path explicitly.

#### Scenario: Default target

- **WHEN** the seed script is run with no arguments
- **THEN** it creates/overwrites only the default demo file (not `runs.db`) and prints
  the path it wrote

#### Scenario: Real db requires explicit intent

- **WHEN** `runs.db` exists and the script is run without naming it
- **THEN** `runs.db` is untouched

### Requirement: Demonstrable dataset shape

The seeded dataset SHALL contain roughly 200 rows shaped so that all four dashboard
views show meaningful content: several configs with multiple repeats (including at least
one under-sampled config with n < 5 and one noisy config with CoV > 5%), at least 3
commits on one device+branch for the trend view, 2 devices, a tile sweep over multiple
(m, n, k) combinations for one commit+device, per-run samples arrays with realistic
spread, and at least one row with `excluded = 1`.

#### Scenario: All views demonstrable

- **WHEN** the dashboard is pointed at a freshly seeded demo database
- **THEN** the configs table shows highlighted and normal rows, the trend view draws a
  multi-commit line, the tile-sweep heatmap has a grid of cells with a working k
  selector, and a run detail view shows a populated samples strip plot

#### Scenario: Excluded row present

- **WHEN** the seeded database is queried with and without `include_excluded=1`
- **THEN** the row counts differ, demonstrating the exclusion semantics
