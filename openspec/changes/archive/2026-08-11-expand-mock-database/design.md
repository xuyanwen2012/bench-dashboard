# Design — Expand Mock Database

## Context

See proposal.md — Why. `seed.ts` already owns the DDL (unchanged here: `runs` +
`sweep_runs` per the category split) and generates ~430 deterministic rows via a
mulberry32 RNG and per-scenario loops with hand-picked means. The dashboard reads any
dimension values it finds — nothing in `db.ts` or the UI enumerates devices, drivers,
branches, or models statically — so this change is purely additive data generation.

## Goals / Non-Goals

**Goals**

- One declarative coverage matrix in `seed.ts` (devices × drivers × models × branches)
  instead of more copy-pasted loops, so future breadth changes are table edits.
- Keep the purpose-built demo hooks (under-sampled, noisy, excluded, missing-8B,
  older-commit-worse) intact and easy to find.

**Non-Goals**

- No schema changes, no dashboard code changes, no new npm dependencies.
- Not a load test: row count stays well under 2,000; seed run stays < 5 s.
- No attempt to mimic real thermal-throttling time series beyond the existing noisy
  config.

## Decisions

### Device matrix (4 devices, 2 drivers each)

| device id | basis | drivers | 1B decode base | fits 8B? |
|---|---|---|---|---|
| `s24plus-xclipse940` | real S24+ (Exynos/Xclipse) | `24.1.307`, `24.0.292` (older, ~3% slower) | ~23 tok/s | yes |
| `pixel7a-mali-g710` | real Pixel 7a | `r54p3`, `r54p2` (~3% slower) | ~11 tok/s | **no** (memory) |
| `s24plus-adreno750` | plausible US-variant S24+ (Snapdragon/Adreno) | `512.746`, `512.780` | ~26 tok/s | yes |
| `ryzen780m-radv` | real host iGPU | `mesa-25.1.4`, `mesa-25.0.7` | ~55 tok/s | yes |

Rationale: the two real phones keep continuity with existing data; the Adreno variant is
explicitly called out in project docs as a distinct GPU behind the same marketing name;
the 780M host exists in this project and stretches the performance axis. Alternatives
considered: inventing generic "device-a/b/c" names — rejected, realistic names make the
demo read like real data and match how filters will actually look.

Existing device ids, branch names, and commit hashes are kept verbatim so archived
screenshots/bookmarks stay meaningful.

### Model scaling

Per-model throughput factors relative to 1B: 3B ≈ 0.45×, 8B ≈ 0.18× (matches the
existing seed's ratios, which came from real relative numbers). Prefill ≈ 16.6× decode
stays the global heuristic.

### Branches and commits

Three branches: `yanwen/dev-1.3` (primary, 5+ commits, the existing trend story),
`release/1.3` (stable, 2 commits, ~4% behind dev tip), and new `yanwen/dev-igpu`
(feature branch, 2 commits, present mainly on `ryzen780m-radv` and slightly ahead of
dev on that device — a plausible "feature branch wins on its target hardware" story).
Commit hashes remain fixed fake strings so reruns are stable.

### Sweeps

`sweep_runs` gains: a second swept device already exists (Pixel 7a) — extend it to 2
commits so its sweep trend has history too, and add one swept commit for
`ryzen780m-radv` with a peak at a different tile (e.g. 128×64×32) so the heatmap
doesn't look identical across devices.

### Structure over loops

Replace the ad-hoc scenario loops with: a `DEVICES` table (id, drivers, per-model base
means, has8B flag), a `BRANCHES` table (name, commits, factor), and one nested
generation loop; keep the special-case blocks (under-sampled, noisy, excluded, driver
A/B) as small explicit sections after the matrix loop. Alternative — keeping the current
copy-paste style — rejected: at 4×2×3×3 the copy-paste count explodes and drifts.

## Risks / Trade-offs

- [Fabricated devices could be mistaken for real data] → device list and README wording
  make clear seed.db is a mockup; the Adreno numbers are labeled plausible, not measured.
- [Row count creep slows CI-ish workflows] → hard ceiling ~1,500 rows; assert or log the
  count at the end of seeding.
- [Matrix refactor accidentally changes existing demo hooks] → verify after reseeding:
  flags still appear in configs view, excluded row still present, 8B still absent on
  Pixel 7a, driver A/B still same-commit-same-model.

## Open Questions

None — all coverage numbers above are assumptions recorded here; tweak the tables at
implementation time if the user wants different devices or ratios.
