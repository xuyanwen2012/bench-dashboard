// Standalone seed script: fabricates a realistic benchmark dataset in a SEPARATE
// db file so the dashboard is demonstrable without real data.
//
//   bun run seed.ts [target.db]     (default: ./seed.db)
//
// Never wired to any lifecycle hook. Refuses to touch runs.db unless that exact
// path is typed on the command line.

import { Database } from "bun:sqlite";
import { existsSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";

const arg = Bun.argv[2];
const target = resolve(arg ?? "seed.db");

if (basename(target) === "runs.db" && !arg) {
  console.error(
    "refusing to write runs.db implicitly; pass the path explicitly if you really mean it",
  );
  process.exit(1);
}
if (basename(target) === "runs.db") {
  console.error(
    `WARNING: overwriting ${target} — this is normally the REAL benchmark db (ctrl-c within 5s)`,
  );
  await Bun.sleep(5000);
}

if (existsSync(target)) rmSync(target);
const db = new Database(target, { create: true });

// DDL per the brief's column list. If a real schema.sql appears later, replace
// this block with its contents verbatim (dashboard code never runs this DDL).
//
// Two benchmark categories, two tables:
//   runs       — e2e model runs (prefill + decode tok/s per run)
//   sweep_runs — tile-sweep microbenchmarks (prefill tok/s only; tile m/n/k are
//                real columns, and there is no config_hash — a cell is identified
//                by commit+device+tile)
db.exec(`
CREATE TABLE runs (
  id            INTEGER PRIMARY KEY,
  ts            INTEGER NOT NULL,          -- unix epoch seconds
  config_hash   TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  repeat_idx    INTEGER NOT NULL,
  commit_hash   TEXT NOT NULL,
  branch        TEXT NOT NULL,
  dirty         INTEGER NOT NULL DEFAULT 0,
  device        TEXT NOT NULL,
  driver_ver    TEXT NOT NULL,
  freq_pinned   INTEGER NOT NULL DEFAULT 0,
  temp_start_mc INTEGER,
  temp_end_mc   INTEGER,
  battery_pct   INTEGER,
  cmdline       TEXT NOT NULL,
  params        TEXT NOT NULL,             -- JSON object
  decode_tps    REAL,
  prefill_tps   REAL,
  samples       TEXT,                      -- JSON array of per-iteration decode_tps
  excluded      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sweep_runs (
  id            INTEGER PRIMARY KEY,
  ts            INTEGER NOT NULL,
  session_id    TEXT NOT NULL,
  repeat_idx    INTEGER NOT NULL,
  commit_hash   TEXT NOT NULL,
  branch        TEXT NOT NULL,
  dirty         INTEGER NOT NULL DEFAULT 0,
  device        TEXT NOT NULL,
  driver_ver    TEXT NOT NULL,
  freq_pinned   INTEGER NOT NULL DEFAULT 0,
  temp_start_mc INTEGER,
  temp_end_mc   INTEGER,
  battery_pct   INTEGER,
  cmdline       TEXT NOT NULL,
  params        TEXT NOT NULL,             -- JSON object (model, quant, ...)
  tile_m        INTEGER NOT NULL,
  tile_n        INTEGER NOT NULL,
  tile_k        INTEGER NOT NULL,
  prefill_tps   REAL,
  samples       TEXT,                      -- JSON array of per-iteration prefill_tps
  excluded      INTEGER NOT NULL DEFAULT 0
);

CREATE VIEW config_stats AS
SELECT
  config_hash,
  MIN(commit_hash) AS commit_hash,
  MIN(branch)      AS branch,
  MIN(device)      AS device,
  MIN(driver_ver)  AS driver_ver,
  COUNT(*)         AS n,
  AVG(decode_tps)  AS mean_tps,
  sqrt(max(AVG(decode_tps*decode_tps) - AVG(decode_tps)*AVG(decode_tps), 0)) AS sd_tps,
  100.0 * sqrt(max(AVG(decode_tps*decode_tps) - AVG(decode_tps)*AVG(decode_tps), 0))
        / AVG(decode_tps) AS cov_pct
FROM runs
WHERE excluded = 0
GROUP BY config_hash;
`);

// deterministic RNG so reruns produce the same dataset
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0xbeef);
const gauss = (mean: number, sd: number) => {
  const u = 1 - rnd(),
    v = rnd();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

// ---- coverage matrix (see openspec/changes/expand-mock-database/design.md) ----

type DevRef = { device: string; driver_ver: string };

type Device = {
  device: string;
  drivers: [string, string]; // [current, older (~3% slower)]
  base1b: number; // 1B decode tok/s at dev tip on the current driver
  has8b: boolean; // 8B fits in memory
  sweepPeak: { m: number; n: number }; // tile where the sweep surface peaks
};

// The two real phones keep their existing ids/drivers; the Adreno S24+ (US variant)
// and the 780M host iGPU are plausible mock devices that widen the matrix.
const DEVICES: Device[] = [
  {
    device: "s24plus-xclipse940",
    drivers: ["24.1.307", "24.0.292"],
    base1b: 23.4,
    has8b: true,
    sweepPeak: { m: 64, n: 128 },
  },
  {
    device: "pixel7a-mali-g710",
    drivers: ["r54p3", "r54p2"],
    base1b: 10.9,
    has8b: false, // 8B does not fit in 7.3 GiB — the deliberate empty cell
    sweepPeak: { m: 64, n: 128 },
  },
  {
    device: "s24plus-adreno750",
    drivers: ["512.746", "512.780"],
    base1b: 26.2,
    has8b: true,
    sweepPeak: { m: 64, n: 128 },
  },
  {
    device: "ryzen780m-radv",
    drivers: ["mesa-25.1.4", "mesa-25.0.7"],
    base1b: 55.0,
    has8b: true,
    sweepPeak: { m: 128, n: 64 }, // different peak so heatmaps differ per device
  },
];
const PRIMARY = DEVICES[0];
const cur = (d: Device): DevRef => ({ device: d.device, driver_ver: d.drivers[0] });
const older = (d: Device): DevRef => ({ device: d.device, driver_ver: d.drivers[1] });

// [model id, throughput factor relative to 1B]
const MODELS: [string, number][] = [
  ["llama3_2_1b", 1],
  ["llama3_2_3b", 0.45],
  ["llama3_1_8b", 0.18],
];

// Branches with per-commit performance factors relative to the device dev-tip base.
// dev: regression at commit 3, recovered after (the original trend story).
// stable: ~4% behind dev tip. igpu: feature branch that wins on its target hardware.
const DEV_BRANCH = "yanwen/dev-1.3";
const STABLE = "release/1.3";
const IGPU = "yanwen/dev-igpu";
const COMMITS = ["a1b2c3d4e5f6", "b2c3d4e5f6a7", "c3d4e5f6a7b8", "d4e5f6a7b8c9", "e5f6a7b8c9d0"];
const DEV_FACTOR = [0.919, 0.953, 0.846, 0.979, 1.0];
const SCOMMITS = ["f1a2b3c4d5e6", "a7b8c9d0e1f2"];
const STABLE_FACTOR = [0.944, 0.962];
const ICOMMITS = ["0f1e2d3c4b5a", "1a2b3c4d5e6f"];
const IGPU_FACTOR = [0.99, 1.06];

const OLD_DRIVER_PENALTY = 0.97;
const PREFILL_PER_DECODE = 16.6;

const BASE_TS = 1753000000; // fixed epoch base, commits a day apart
const devTs = (ci: number) => BASE_TS + ci * 86400;
const stableTs = (ci: number) => BASE_TS + 2 * 86400 + ci * 3 * 86400;
const igpuTs = (ci: number) => BASE_TS + (3 + 2 * ci) * 86400 + 30000;
// stagger devices so no two rows share a timestamp
const devOffset = (d: Device) => DEVICES.indexOf(d) * 20000;

const insert = db.prepare(`INSERT INTO runs
  (ts, config_hash, session_id, repeat_idx, commit_hash, branch, dirty, device, driver_ver,
   freq_pinned, temp_start_mc, temp_end_mc, battery_pct, cmdline, params,
   decode_tps, prefill_tps, samples, excluded)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertSweep = db.prepare(`INSERT INTO sweep_runs
  (ts, session_id, repeat_idx, commit_hash, branch, dirty, device, driver_ver,
   freq_pinned, temp_start_mc, temp_end_mc, battery_pct, cmdline, params,
   tile_m, tile_n, tile_k, prefill_tps, samples, excluded)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const cmdFor = (model: string) =>
  `./llama_main --model_path=${model}_4w_buffer_ctx3072.pte --tokenizer_path=tokenizer.model --prompt_file=p2048_exact.txt --num_bos=1 --temperature=0 --max_new_tokens=8 --warmup=true`;

let totalE2e = 0;
let totalSweep = 0;
function addRun(o: {
  ts: number;
  commit: string;
  dev: DevRef;
  session: string;
  repeat: number;
  decodeMean: number;
  covPct: number;
  branch?: string;
  model?: string;
  excluded?: number;
  paramsExtra?: Record<string, unknown>;
}) {
  const model = o.model ?? "llama3_2_1b";
  const params = JSON.stringify({
    model,
    quant: "4w",
    ctx: 3072,
    storage: "buffer",
    ...o.paramsExtra,
  });
  const cfg = hash([o.commit, o.dev.device, o.dev.driver_ver, params].join("|"));
  const sd = (o.decodeMean * o.covPct) / 100;
  const decode = gauss(o.decodeMean, sd);
  const samples = Array.from({ length: 10 }, () => +gauss(decode, decode * 0.015).toFixed(3));
  const tStart = Math.round(gauss(31000, 1500));
  insert.run(
    o.ts,
    cfg,
    o.session,
    o.repeat,
    o.commit,
    o.branch ?? DEV_BRANCH,
    0,
    o.dev.device,
    o.dev.driver_ver,
    0,
    tStart,
    tStart + Math.round(gauss(6500, 900)),
    Math.min(100, Math.max(20, Math.round(gauss(80, 8)))),
    cmdFor(model),
    params,
    +decode.toFixed(3),
    +gauss(o.decodeMean * PREFILL_PER_DECODE, o.decodeMean * PREFILL_PER_DECODE * 0.02).toFixed(2),
    JSON.stringify(samples),
    o.excluded ?? 0,
  );
  totalE2e++;
}

function addSweep(o: {
  ts: number;
  commit: string;
  dev: DevRef;
  session: string;
  repeat: number;
  tile: { m: number; n: number; k: number };
  prefillMean: number;
  covPct: number;
  model?: string;
}) {
  const model = o.model ?? "llama3_2_1b";
  const params = JSON.stringify({ model, quant: "4w", ctx: 3072, storage: "buffer" });
  const sd = (o.prefillMean * o.covPct) / 100;
  const prefill = gauss(o.prefillMean, sd);
  const samples = Array.from({ length: 5 }, () => +gauss(prefill, prefill * 0.01).toFixed(2));
  const tStart = Math.round(gauss(31000, 1500));
  insertSweep.run(
    o.ts,
    o.session,
    o.repeat,
    o.commit,
    DEV_BRANCH,
    0,
    o.dev.device,
    o.dev.driver_ver,
    0,
    tStart,
    tStart + Math.round(gauss(4500, 700)),
    Math.min(100, Math.max(20, Math.round(gauss(80, 8)))),
    `ET_VK_Q4GSW_COOPMAT_VARIANT=m${o.tile.m}n${o.tile.n}k${o.tile.k} ${cmdFor(model)}`,
    params,
    o.tile.m,
    o.tile.n,
    o.tile.k,
    +prefill.toFixed(2),
    JSON.stringify(samples),
    0,
  );
  totalSweep++;
}

db.transaction(() => {
  // ---- dev branch: 1B trend + 3B/8B on the newest two commits, per device ----
  // Primary device carries the full 5-commit trend; the rest get the last 3 commits.
  COMMITS.forEach((commit, ci) => {
    for (const dev of DEVICES) {
      const isPrimary = dev === PRIMARY;
      if (!isPrimary && ci < COMMITS.length - 3) continue;
      const ts0 = devTs(ci) + devOffset(dev);
      const reps = isPrimary ? 8 : 6;
      for (let r = 0; r < reps; r++)
        addRun({
          ts: ts0 + r * 600,
          commit,
          dev: cur(dev),
          session: `${dev.device}-trend-${ci}`,
          repeat: r,
          decodeMean: dev.base1b * DEV_FACTOR[ci],
          covPct: 1.6,
        });
      if (ci >= COMMITS.length - 2) {
        for (const [model, factor] of MODELS.slice(1)) {
          if (model === "llama3_1_8b" && !dev.has8b) continue;
          const mreps = ci === COMMITS.length - 1 ? 6 : 4;
          for (let r = 0; r < mreps; r++)
            addRun({
              ts: ts0 + 60000 + MODELS.findIndex((m) => m[0] === model) * 5000 + r * 900,
              commit,
              dev: cur(dev),
              session: `${dev.device}-${model}-${ci}`,
              repeat: r,
              decodeMean: dev.base1b * factor * DEV_FACTOR[ci],
              covPct: 1.6,
              model,
            });
        }
      }
    }
  });

  // ---- driver A/B: every device gets the older driver at the dev tip commit, ----
  // same model, so the driver comparison is apples-to-apples on all 4 devices.
  for (const dev of DEVICES) {
    for (let r = 0; r < 6; r++)
      addRun({
        ts: devTs(4) + devOffset(dev) + 80000 + r * 900,
        commit: COMMITS[4],
        dev: older(dev),
        session: `${dev.device}-driver-old`,
        repeat: r,
        decodeMean: dev.base1b * DEV_FACTOR[4] * OLD_DRIVER_PENALTY,
        covPct: 1.6,
      });
  }

  // ---- stable branch: 1B on every device, 3B/8B on the primary ----
  SCOMMITS.forEach((commit, ci) => {
    for (const dev of DEVICES) {
      const ts0 = stableTs(ci) + devOffset(dev);
      for (let r = 0; r < 6; r++)
        addRun({
          ts: ts0 + r * 600,
          commit,
          dev: cur(dev),
          session: `${dev.device}-stable-${ci}`,
          repeat: r,
          decodeMean: dev.base1b * STABLE_FACTOR[ci],
          covPct: 1.6,
          branch: STABLE,
        });
    }
    for (const [model, factor] of MODELS.slice(1)) {
      const mreps = ci === 1 ? 6 : 4;
      for (let r = 0; r < mreps; r++)
        addRun({
          ts: stableTs(ci) + 60000 + r * 900,
          commit,
          dev: cur(PRIMARY),
          session: `${PRIMARY.device}-${model}-stable-${ci}`,
          repeat: r,
          decodeMean: PRIMARY.base1b * factor * STABLE_FACTOR[ci],
          covPct: 1.6,
          model,
          branch: STABLE,
        });
    }
  });

  // ---- feature branch (dev-igpu): lives on the host iGPU, tip beats dev there ----
  const ryzen = DEVICES[3];
  ICOMMITS.forEach((commit, ci) => {
    const ts0 = igpuTs(ci);
    for (let r = 0; r < 6; r++)
      addRun({
        ts: ts0 + r * 600,
        commit,
        dev: cur(ryzen),
        session: `${ryzen.device}-igpu-${ci}`,
        repeat: r,
        decodeMean: ryzen.base1b * IGPU_FACTOR[ci],
        covPct: 1.6,
        branch: IGPU,
      });
    if (ci === 1)
      for (let r = 0; r < 4; r++)
        addRun({
          ts: ts0 + 60000 + r * 900,
          commit,
          dev: cur(ryzen),
          session: `${ryzen.device}-igpu-3b-${ci}`,
          repeat: r,
          decodeMean: ryzen.base1b * 0.45 * IGPU_FACTOR[ci],
          covPct: 1.6,
          model: "llama3_2_3b",
          branch: IGPU,
        });
  });

  // ---- demo hooks: under-sampled (n=3), noisy (CoV ~8%), one excluded row ----
  const p7a = DEVICES[1];
  for (let r = 0; r < 3; r++)
    addRun({
      ts: BASE_TS + 6 * 86400 + r * 700,
      commit: COMMITS[2],
      dev: cur(p7a),
      session: "p7a-undersampled",
      repeat: r,
      decodeMean: 11.1,
      covPct: 1.5,
      paramsExtra: { ctx: 4096 },
    });
  for (let r = 0; r < 6; r++)
    addRun({
      ts: BASE_TS + 6 * 86400 + 10000 + r * 700,
      commit: COMMITS[2],
      dev: cur(p7a),
      session: "p7a-noisy-thermal",
      repeat: r,
      decodeMean: 10.4 - r * 0.35,
      covPct: 8,
      paramsExtra: { freq: "unpinned" },
    });
  addRun({
    ts: BASE_TS + 6 * 86400 + 20000,
    commit: COMMITS[2],
    dev: cur(p7a),
    session: "p7a-noisy-thermal",
    repeat: 6,
    decodeMean: 7.9,
    covPct: 2,
    excluded: 1,
    paramsExtra: { freq: "unpinned" },
  });

  // ---- tile sweeps (prefill tok/s): m,n in {32,64,96,128}, k in {16,32}, 3 reps ----
  // S24+ and Pixel 7a each get two swept commits (sweep trend has history on both);
  // the 780M gets one swept commit with its peak at a different tile.
  const surface = (dev: Device, base: number, m: number, n: number, k: number) =>
    base +
    (k === 32 ? base * 0.035 : 0) -
    Math.abs(m - dev.sweepPeak.m) * (base / 640) -
    Math.abs(n - dev.sweepPeak.n) * (base / 1000);
  const sweep = (commit: string, dev: Device, ts0: number, base: number) => {
    let i = 0;
    for (const k of [16, 32])
      for (const m of [32, 64, 96, 128])
        for (const n of [32, 64, 96, 128])
          for (let r = 0; r < 3; r++)
            addSweep({
              ts: ts0 + i++ * 300,
              commit,
              dev: cur(dev),
              session: `${dev.device}-tsweep-${commit.slice(0, 4)}-k${k}`,
              repeat: r,
              tile: { m, n, k },
              prefillMean: surface(dev, base, m, n, k),
              covPct: 1.2,
            });
  };
  sweep(COMMITS[3], PRIMARY, devTs(4) + 50000, 342);
  sweep(COMMITS[4], PRIMARY, devTs(5), 368);
  sweep(COMMITS[2], p7a, devTs(4) + 70000, 162);
  sweep(COMMITS[3], p7a, devTs(4) + 110000, 171);
  sweep(COMMITS[4], ryzen, devTs(5) + 40000, 880);
})();

db.close();
console.log(`seeded ${totalE2e} e2e rows + ${totalSweep} sweep rows into ${target}`);
if (totalE2e + totalSweep > 1500)
  console.warn(`WARNING: ${totalE2e + totalSweep} rows exceeds the ~1500-row envelope`);
