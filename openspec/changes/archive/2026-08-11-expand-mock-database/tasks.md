# Tasks — Expand Mock Database

## 1. Restructure generation around a coverage matrix

- [x] 1.1 In `seed.ts`, define the `DEVICES` table from design.md (4 devices, 2 driver
      versions each, per-model 1B/3B/8B decode base means, `has8B` flag) and the
      `BRANCHES` table (3 branches with commit lists and performance factors); keep
      existing device ids, branch names, and commit hashes verbatim
- [x] 1.2 Replace the copy-pasted e2e scenario loops with one nested matrix loop
      (branch × commit × device × model × repeats) driven by those tables, skipping 8B
      on `pixel7a-mali-g710` and applying the older-driver ~3% penalty
- [x] 1.3 Re-add the special-case blocks after the matrix loop: under-sampled config
      (n<5), noisy config (CoV>5%), one `excluded=1` row, and the same-commit
      same-model driver A/B pair

## 2. Expand tile sweeps

- [x] 2.1 Add a second swept commit for `pixel7a-mali-g710` so its sweep trend has ≥2
      points
- [x] 2.2 Add one swept commit for `ryzen780m-radv` with the peak at a different tile
      (128×64×32) and prefill values scaled to that device

## 3. Verify against the spec scenarios

- [x] 3.1 Reseed and check breadth via `/api/meta`: ≥4 devices, ≥8 (device, driver)
      combinations, 3 branches, 3 models; total rows in the high hundreds and under
      1,500 (log both table counts at the end of seeding)
- [x] 3.2 Check demo hooks survived: configs view shows n<5 and CoV>5% flags,
      `include_excluded=1` changes row counts, compare with x=model/series=branch shows
      1B/3B/8B for ≥2 branches, the Pixel 7a 8B cell is empty, and driver-version
      compare on one device shows a visible difference
- [x] 3.3 Check sweep views: heatmap commit selector offers multiple commits on ≥2
      devices; sweep trend draws ≥2 points for S24+ and Pixel 7a; 780M heatmap peaks at
      a different tile
- [x] 3.4 Run `bun run typecheck` and `bun run lint`; update the README seed line
      (row counts, device/branch breadth) and confirm seeding stays < 5 s
