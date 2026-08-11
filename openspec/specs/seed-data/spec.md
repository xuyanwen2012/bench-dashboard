# seed-data Specification

## Purpose

A standalone, opt-in seed script that fabricates a small but realistic benchmark dataset
in a separate database file, so every dashboard view is demonstrable when `runs.db` is
missing or empty — without ever touching real data automatically.

## Requirements

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

The seeded dataset SHALL populate both benchmark categories so that every dashboard view
shows meaningful content. The e2e `runs` table SHALL contain several configs with multiple
repeats (including at least one under-sampled config with n < 5 and one noisy config with
CoV > 5%), at least 5 commits on the primary device+branch for the trend view, per-run
samples arrays with realistic spread, and at least one row with `excluded = 1`. The
`sweep_runs` table SHALL contain tile sweeps over multiple (m, n, k) combinations on at
least 2 devices, with at least 2 swept commits on at least one of those devices so the
sweep trend has history. Total row count SHALL stay in the high hundreds to low thousands,
and generation SHALL remain deterministic and complete in a few seconds.

#### Scenario: All views demonstrable

- **WHEN** the dashboard is pointed at a freshly seeded demo database
- **THEN** the configs table shows flagged and normal rows, the e2e trend view draws a
  multi-commit line, the sweep heatmap has a grid of cells with a working k selector and
  a commit selector offering multiple commits, the sweep trend draws at least 2 points
  for one device, and a run detail view shows a populated samples strip plot

#### Scenario: Excluded row present

- **WHEN** the seeded database is queried with and without `include_excluded=1`
- **THEN** the row counts differ, demonstrating the exclusion semantics

### Requirement: Compare-dimension coverage

The seeded dataset SHALL make every filter and compare dimension demonstrable with
realistic breadth: at least 4 devices with plausible identities and performance ratios;
**every device carrying at least 2 driver versions** with a small, distinguishable
performance difference between them on at least one device; at least 3 branches (dev,
stable, and a feature branch) with distinguishable performance and multiple commits per
branch; and all three model sizes (1B/3B/8B) with realistic relative throughput on every
device that plausibly fits them. At least one device SHALL deliberately lack 8B runs so
empty-cell handling stays visible. Multiple commits per branch SHALL exist so
latest-commit-per-cell semantics are observable.

#### Scenario: Device and driver breadth

- **WHEN** the filter bar or compare view enumerates dimension values from a freshly
  seeded database
- **THEN** at least 4 devices and at least 8 (device, driver_ver) combinations are
  offered, and comparing driver versions on a single device shows a visible difference

#### Scenario: Branch comparison demonstrable

- **WHEN** the compare view is pointed at a freshly seeded database with x=model,
  series=branch on the primary device
- **THEN** bars for 1B/3B/8B appear for at least 2 branches with visibly different
  heights

#### Scenario: Missing combination stays empty

- **WHEN** the comparison includes the device that lacks 8B runs
- **THEN** that cell renders empty, not zero

#### Scenario: Latest-commit semantics observable

- **WHEN** a compared branch contains an older commit with clearly different performance
- **THEN** the compare cell reflects only the newest commit's runs
