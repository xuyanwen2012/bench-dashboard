// Measurement-quality heuristics over run rows. Thresholds encode the thermal
// protocol from ../CLAUDE.md: throttling shows up as a large temp rise within a
// run, per-iteration throughput decaying over a run, or rep means declining
// monotonically across a session. Flags are advisory strings, not exclusions.

export type QualityRun = {
  session_id: string;
  repeat_idx: number;
  ts: number;
  decode_tps: number | null;
  temp_start_mc: number | null;
  temp_end_mc: number | null;
  freq_pinned: number;
  dirty: number;
  samples: number[] | null;
};

export const HOT_START_C = 5; // °C above the config's coolest start = skipped cooldown
export const SAMPLE_DECLINE_PCT = 5; // first-half → second-half decline within a run
export const REP_DECLINE_PCT = 5; // first → last rep decline within a session
const REP_MIN = 3; // reps needed before calling a session-wide decline
const SAMPLE_MIN = 6; // iterations needed before calling a within-run decline
const REP_DOWN_FRACTION = 0.8; // share of rep-to-rep steps that must decrease

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const declinePct = (first: number, last: number) =>
  first > 0 ? (100 * (first - last)) / first : 0;

// The coolest start among a config's runs — the "properly idled" baseline the
// hot-start check compares against. (Temps always rise DURING a run; that is
// physics, not a flag. The protocol violation is starting hot.)
export function minTempStart(runs: QualityRun[]): number | null {
  let min: number | null = null;
  for (const r of runs)
    if (r.temp_start_mc != null && (min == null || r.temp_start_mc < min)) min = r.temp_start_mc;
  return min;
}

// Deliberately NOT flagged: freq_pinned=0 (the normal state on phones) and
// within-run temp rise (always happens). Both stay visible in run detail.
export function runQuality(r: QualityRun, minStartMc: number | null): string[] {
  const flags: string[] = [];
  if (minStartMc != null && r.temp_start_mc != null) {
    const above = (r.temp_start_mc - minStartMc) / 1000;
    if (above >= HOT_START_C) flags.push(`hot start +${above.toFixed(1)}°C`);
  }
  const s = r.samples;
  if (s && s.length >= SAMPLE_MIN) {
    const half = Math.floor(s.length / 2);
    const d = declinePct(mean(s.slice(0, half)), mean(s.slice(-half)));
    if (d >= SAMPLE_DECLINE_PCT) flags.push(`samples ↓${d.toFixed(0)}%`);
  }
  if (r.dirty) flags.push("dirty");
  return flags;
}

// Config-level: the session-wise rep-decline signature first (the classic
// throttle pattern), then counts of per-run flags across the config's runs.
export function configQuality(runs: QualityRun[]): string[] {
  const flags: string[] = [];

  const sessions = new Map<string, QualityRun[]>();
  for (const r of runs) {
    if (r.decode_tps == null) continue;
    const g = sessions.get(r.session_id);
    if (g) g.push(r);
    else sessions.set(r.session_id, [r]);
  }
  let worst = 0;
  for (const g of sessions.values()) {
    if (g.length < REP_MIN) continue;
    g.sort((a, b) => a.repeat_idx - b.repeat_idx || a.ts - b.ts);
    const tps = g.map((r) => r.decode_tps as number);
    let down = 0;
    for (let i = 1; i < tps.length; i++) if (tps[i] < tps[i - 1]) down++;
    const d = declinePct(tps[0], tps[tps.length - 1]);
    if (d >= REP_DECLINE_PCT && down >= Math.ceil(REP_DOWN_FRACTION * (tps.length - 1)))
      worst = Math.max(worst, d);
  }
  if (worst > 0) flags.push(`reps ↓${worst.toFixed(0)}%`);

  const base = minTempStart(runs);
  let hot = 0;
  let decaying = 0;
  let dirty = 0;
  for (const r of runs) {
    const f = runQuality(r, base);
    if (f.some((x) => x.startsWith("hot start"))) hot++;
    if (f.some((x) => x.startsWith("samples"))) decaying++;
    if (f.includes("dirty")) dirty++;
  }
  if (hot) flags.push(`hot start ×${hot}`);
  if (decaying) flags.push(`samples↓ ×${decaying}`);
  if (dirty) flags.push(`dirty ×${dirty}`);
  return flags;
}
