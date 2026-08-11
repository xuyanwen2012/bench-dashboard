// add_run.ts — append one benchmark run to the dashboard db (the ONE writer
// besides seed.ts). Creates the schema on first use, so a harness can start
// from an empty file:
//
//   e2e run, numbers parsed from llama_main output piped on stdin:
//     adb -s R5CY21Y3VEV shell "cd /data/local/tmp/llama_dev && ./llama_main ..." | \
//       bun run add_run.ts --device s24plus-xclipse940 --driver 24.1.307 \
//         --commit 676eca2 --branch yanwen/dev-1.3 --session s24-0811-a \
//         --model llama3_2_1b --quant 4w --ctx 3072 --storage buffer \
//         --temp-start-mc 31200 --temp-end-mc 42100
//
//   tile-sweep run (prefill only, tile cell instead of config_hash):
//     ... | bun run add_run.ts --sweep --tile-m 128 --tile-n 128 --tile-k 32 \
//         --device s24plus-xclipse940 --driver 24.1.307 --commit 676eca2 \
//         --branch yanwen/dev-1.3 --session s24-sweep-0811 --model llama3_2_1b
//
// Without stdin, pass --prefill-tps / --decode-tps explicitly. --repeat is
// auto-incremented within the session's cell when omitted, so a cooldown loop
// can just re-run the same command line. --dry-run prints the row instead of
// writing it.

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const HELP = `add_run.ts — append one benchmark run to the dashboard db

usage: [llama_main output |] bun run add_run.ts [flags]

  --db <path>           target db (default ./runs.db; created if missing)
  --sweep               write a tile-sweep row (sweep_runs) instead of an e2e run

required metadata:
  --device <s>          e.g. s24plus-xclipse940
  --driver <s>          driver_ver, e.g. 24.1.307
  --commit <s>          commit hash of the runtime build
  --branch <s>          e.g. yanwen/dev-1.3
  --session <s>         one session = one back-to-back batch of reps; the
                        heat-soak flag (reps declining) is computed within it
  --model <s>           model id, e.g. llama3_2_1b (stored in params JSON)

numbers (parsed from a PyTorchObserver {...} line on stdin when piped):
  --prefill-tps <f>     required for --sweep; required for e2e with --decode-tps
  --decode-tps <f>      e2e only
  --samples <json>      per-iteration tok/s array (decode for e2e, prefill for sweep)

optional:
  --quant <s> --ctx <n> --storage <s>   common params (into params JSON)
  --param k=v           extra params entry, repeatable
  --repeat <n>          repeat_idx (default: next free index in the session's cell)
  --ts <unix-seconds>   default: now
  --temp-start-mc <n> --temp-end-mc <n> --battery <n> --freq-pinned --dirty
  --cmdline <s>         stored verbatim (default "")
  --tile-m/--tile-n/--tile-k <n>        sweep cell, required with --sweep
  --dry-run             print the row as JSON, write nothing`;

// ---- flag parsing (no deps; every value flag takes exactly one argument) ----

const argv = Bun.argv.slice(2);
const flags = new Map<string, string[]>();
const BOOL = new Set(["--sweep", "--freq-pinned", "--dirty", "--dry-run", "--help", "-h"]);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--") && a !== "-h") fail(`unexpected argument: ${a}`);
  const vals = flags.get(a) ?? [];
  if (!BOOL.has(a)) {
    const v = argv[++i];
    if (v === undefined) fail(`${a} needs a value`);
    vals.push(v);
  }
  flags.set(a, vals);
}
if (flags.has("--help") || flags.has("-h")) {
  console.log(HELP);
  process.exit(0);
}

function fail(msg: string): never {
  console.error(`add_run: ${msg}\n\nrun with --help for usage`);
  process.exit(1);
}
const one = (name: string) => {
  const v = flags.get(name);
  if (v && v.length > 1) fail(`${name} given more than once`);
  return v?.[0];
};
const req = (name: string) => one(name) ?? fail(`${name} is required`);
const num = (name: string) => {
  const v = one(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) fail(`${name} must be a number, got: ${v}`);
  return n;
};
const int = (name: string) => {
  const n = num(name);
  if (n !== undefined && !Number.isInteger(n)) fail(`${name} must be an integer`);
  return n;
};

// ---- numbers: explicit flags win, else the PyTorchObserver line on stdin ----

let prefillTps = num("--prefill-tps");
let decodeTps = num("--decode-tps");
let stdinText = "";
if (!process.stdin.isTTY) {
  stdinText = await new Response(Bun.stdin.stream()).text();
  const m = stdinText.match(/PyTorchObserver\s+(\{.*\})/);
  if (m) {
    try {
      const obs = JSON.parse(m[1]) as Record<string, unknown>;
      const pick = (k: string) => (typeof obs[k] === "number" ? (obs[k] as number) : undefined);
      prefillTps ??= pick("prefill_token_per_sec");
      decodeTps ??= pick("decode_token_per_sec");
    } catch {
      fail("found a PyTorchObserver line on stdin but its JSON does not parse");
    }
  } else if (stdinText.trim() && prefillTps === undefined && decodeTps === undefined) {
    fail("stdin has output but no PyTorchObserver {...} line; pass --prefill-tps/--decode-tps");
  }
}

const sweep = flags.has("--sweep");
if (sweep) {
  if (prefillTps === undefined) fail("--sweep needs prefill tok/s (flag or stdin)");
  if (one("--decode-tps")) fail("--decode-tps does not apply to --sweep (prefill-only metric)");
} else if (prefillTps === undefined || decodeTps === undefined) {
  fail("an e2e run needs both prefill and decode tok/s (flags or stdin)");
}

// ---- assemble the row ----

const model = req("--model");
const params: Record<string, unknown> = { model };
for (const [k, flag] of [
  ["quant", "--quant"],
  ["storage", "--storage"],
] as const) {
  const v = one(flag);
  if (v !== undefined) params[k] = v;
}
const ctx = int("--ctx");
if (ctx !== undefined) params.ctx = ctx;
for (const kv of flags.get("--param") ?? []) {
  const eq = kv.indexOf("=");
  if (eq < 1) fail(`--param expects key=value, got: ${kv}`);
  params[kv.slice(0, eq)] = kv.slice(eq + 1);
}

const device = req("--device");
const driver = req("--driver");
const commit = req("--commit");
const branch = req("--branch");
const session = req("--session");
const ts = int("--ts") ?? Math.floor(Date.now() / 1000);

const samplesRaw = one("--samples");
let samples: string | null = null;
if (samplesRaw !== undefined) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(samplesRaw);
  } catch {
    fail("--samples must be a JSON array");
  }
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== "number"))
    fail("--samples must be a JSON array of numbers");
  samples = JSON.stringify(parsed);
}

// same settings + same commit = same config: hash the identity fields with the
// params object key-sorted so flag order can't split a config in two
const paramsSorted = Object.fromEntries(
  Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1)),
);
const configHash = createHash("sha256")
  .update(JSON.stringify({ commit, device, driver, params: paramsSorted }))
  .digest("hex")
  .slice(0, 8);

const tile = { m: int("--tile-m"), n: int("--tile-n"), k: int("--tile-k") };
if (sweep && (tile.m === undefined || tile.n === undefined || tile.k === undefined))
  fail("--sweep needs --tile-m, --tile-n and --tile-k");
if (!sweep && (tile.m !== undefined || tile.n !== undefined || tile.k !== undefined))
  fail("--tile-* only applies with --sweep");

// ---- open db, ensure schema (DDL mirrors seed.ts; IF NOT EXISTS throughout) ----

const dbPath = resolve(one("--db") ?? "./runs.db");
const creating = !existsSync(dbPath);
const db = new Database(dbPath, { create: true });
db.exec("PRAGMA journal_mode=WAL;");
db.exec(`
CREATE TABLE IF NOT EXISTS runs (
  id            INTEGER PRIMARY KEY,
  ts            INTEGER NOT NULL,
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
  params        TEXT NOT NULL,
  decode_tps    REAL,
  prefill_tps   REAL,
  samples       TEXT,
  excluded      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sweep_runs (
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
  params        TEXT NOT NULL,
  tile_m        INTEGER NOT NULL,
  tile_n        INTEGER NOT NULL,
  tile_k        INTEGER NOT NULL,
  prefill_tps   REAL,
  samples       TEXT,
  excluded      INTEGER NOT NULL DEFAULT 0
);
CREATE VIEW IF NOT EXISTS config_stats AS
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

// repeat_idx defaults to the next free index within this session's cell, so a
// rep loop can re-run one command line and the reps stay ordered for the
// heat-soak check
let repeat = int("--repeat");
if (repeat === undefined) {
  const q = sweep
    ? db
        .query(
          `SELECT MAX(repeat_idx) AS m FROM sweep_runs
           WHERE session_id = ? AND commit_hash = ? AND device = ?
             AND tile_m = ? AND tile_n = ? AND tile_k = ?`,
        )
        .get(session, commit, device, tile.m as number, tile.n as number, tile.k as number)
    : db
        .query(`SELECT MAX(repeat_idx) AS m FROM runs WHERE session_id = ? AND config_hash = ?`)
        .get(session, configHash);
  repeat = ((q as { m: number | null }).m ?? -1) + 1;
}

const common = {
  ts,
  session_id: session,
  repeat_idx: repeat,
  commit_hash: commit,
  branch,
  dirty: flags.has("--dirty") ? 1 : 0,
  device,
  driver_ver: driver,
  freq_pinned: flags.has("--freq-pinned") ? 1 : 0,
  temp_start_mc: int("--temp-start-mc") ?? null,
  temp_end_mc: int("--temp-end-mc") ?? null,
  battery_pct: int("--battery") ?? null,
  cmdline: one("--cmdline") ?? "",
  params: JSON.stringify(params),
  samples,
};
const row = sweep
  ? {
      ...common,
      tile_m: tile.m as number,
      tile_n: tile.n as number,
      tile_k: tile.k as number,
      prefill_tps: prefillTps as number,
    }
  : {
      ...common,
      config_hash: configHash,
      prefill_tps: prefillTps ?? null,
      decode_tps: decodeTps ?? null,
    };

if (flags.has("--dry-run")) {
  console.log(JSON.stringify({ table: sweep ? "sweep_runs" : "runs", ...row }, null, 2));
  process.exit(0);
}

const cols = Object.keys(row);
db.query(
  `INSERT INTO ${sweep ? "sweep_runs" : "runs"} (${cols.join(", ")})
   VALUES (${cols.map((c) => `$${c}`).join(", ")})`,
).run(Object.fromEntries(Object.entries(row).map(([k, v]) => [`$${k}`, v])) as never);

const id = (db.query("SELECT last_insert_rowid() AS id").get() as { id: number }).id;
console.log(
  `${creating ? `created ${dbPath}\n` : ""}` +
    `${sweep ? "sweep_runs" : "runs"} id=${id} ` +
    `${sweep ? `tile=${tile.m}x${tile.n}x${tile.k}` : `config=${configHash}`} ` +
    `session=${session} rep=${repeat} ` +
    `prefill=${prefillTps?.toFixed(1) ?? "—"}${sweep ? "" : ` decode=${decodeTps?.toFixed(1) ?? "—"}`} tok/s`,
);
