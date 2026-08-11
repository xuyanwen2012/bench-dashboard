# Delta Spec: seed-data (add-compare-view)

## ADDED Requirements

### Requirement: Compare-dimension coverage

The seeded dataset SHALL make every compare dimension demonstrable: at least two
branches (a dev branch and a stable branch with distinguishable performance), at least
three model sizes (1B/3B/8B) with realistic relative throughput, at least one device
carrying two driver versions, and at least one deliberately missing combination (e.g.
8B absent on the smaller-memory device) so empty-cell handling is visible. Multiple
commits per branch SHALL exist so latest-commit-per-cell semantics are observable.
Generation stays deterministic and the row count stays in the low hundreds.

#### Scenario: Branch comparison demonstrable

- **WHEN** the compare view is pointed at a freshly seeded database with x=model,
  series=branch on the primary device
- **THEN** bars for 1B/3B/8B appear for both branches with visibly different heights

#### Scenario: Missing combination stays empty

- **WHEN** the comparison includes the device that lacks 8B runs
- **THEN** that cell renders empty, not zero

#### Scenario: Latest-commit semantics observable

- **WHEN** a compared branch contains an older commit with clearly different performance
- **THEN** the compare cell reflects only the newest commit's runs
