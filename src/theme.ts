// Chart color tokens per theme, from the dataviz reference palette.
// Keep the ink values in sync with src/styles.css.

export type ChartTokens = {
  surface: string;
  primary: string;
  secondary: string;
  muted: string;
  grid: string;
  axis: string;
  border: string;
  tooltipBg: string;
  series: string;
  band: string;
  /* sequential ramp ordered low -> high; low recedes toward the surface */
  ramp: string[];
};

export const LIGHT: ChartTokens = {
  surface: "#fcfcfb",
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  border: "rgba(11,11,11,0.10)",
  tooltipBg: "#ffffff",
  series: "#2a78d6",
  band: "rgba(42,120,214,0.16)",
  ramp: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#0d366b"],
};

export const DARK: ChartTokens = {
  surface: "#1a1a19",
  primary: "#ffffff",
  secondary: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  border: "rgba(255,255,255,0.10)",
  tooltipBg: "#222220",
  series: "#3987e5",
  band: "rgba(57,135,229,0.18)",
  ramp: ["#0d366b", "#104281", "#1c5cab", "#2a78d6", "#3987e5", "#6da7ec", "#9ec5f4"],
};

// status colors (never used as series); badges pair them with a glyph + ink text
export const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a" };

// categorical series slots (dataviz reference palette, fixed order — never cycled)
export const CAT_LIGHT = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];
export const CAT_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

// short display label for a model id like "llama3_2_1b" -> "1B"
export const modelLabel = (m: string) => {
  const match = /(\d+)b$/i.exec(m);
  return match ? `${match[1]}B` : m;
};
export const modelSize = (m: string) => {
  const match = /(\d+)b$/i.exec(m);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
};

export const chartBase = (t: ChartTokens) => ({
  animation: false,
  backgroundColor: "transparent",
  textStyle: {
    color: t.secondary,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 11,
  },
});

export const tooltipStyle = (t: ChartTokens) => ({
  backgroundColor: t.tooltipBg,
  borderColor: t.border,
  textStyle: { color: t.secondary, fontSize: 12 },
});

// E2E throughput: total tokens / total wall time for the standard run shape.
export const E2E_PREFILL_TOKENS = 2048;
export const E2E_DECODE_TOKENS = 1024;
export function e2eTps(
  prefillTps: number | null | undefined,
  decodeTps: number | null | undefined,
) {
  if (!prefillTps || !decodeTps) return null;
  return (
    (E2E_PREFILL_TOKENS + E2E_DECODE_TOKENS) /
    (E2E_PREFILL_TOKENS / prefillTps + E2E_DECODE_TOKENS / decodeTps)
  );
}

export const shortHash = (h: string | null | undefined) => (h ?? "").slice(0, 8);

export const fmt = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : v.toFixed(digits);

// Commit-over-commit shift test for the trend views: Welch-style z against the
// previous point. Flags both directions — an "improvement" is just as often the
// previous commit having been measured heat-soaked. sd here is population sd of
// few reps, so treat the flag as a pointer, not a significance claim.
export const SHIFT_Z = 2;
const SHIFT_MIN_PCT = 1; // ignore sub-1% moves even when sd is tiny
export type Shift = { dir: 1 | -1; pct: number; z: number };
export function shiftVsPrev(
  pts: { mean: number | null; sd: number | null; n: number }[],
): (Shift | null)[] {
  return pts.map((p, i) => {
    const prev = pts[i - 1];
    if (!prev || p.mean == null || prev.mean == null || prev.mean <= 0) return null;
    const delta = p.mean - prev.mean;
    const pct = (100 * delta) / prev.mean;
    if (Math.abs(pct) < SHIFT_MIN_PCT) return null;
    const se = Math.sqrt(
      (p.sd ?? 0) ** 2 / Math.max(p.n, 1) + (prev.sd ?? 0) ** 2 / Math.max(prev.n, 1),
    );
    const z = se > 0 ? delta / se : Number.POSITIVE_INFINITY * Math.sign(delta);
    if (Math.abs(z) < SHIFT_Z) return null;
    return { dir: delta > 0 ? 1 : -1, pct, z };
  });
}

export const shiftGlyph = (s: Shift) => (s.dir < 0 ? "▼" : "▲");
export const shiftColor = (s: Shift) => (s.dir < 0 ? STATUS.serious : STATUS.good);
export const shiftText = (s: Shift) =>
  `${s.pct > 0 ? "+" : ""}${s.pct.toFixed(1)}% vs prev commit (z=${
    Number.isFinite(s.z) ? Math.abs(s.z).toFixed(1) : "∞"
  })`;

export function stats(values: number[]) {
  const n = values.length;
  if (!n) return { n: 0, mean: null, sd: null, cov: null } as const;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  return { n, mean, sd, cov: mean ? (100 * sd) / mean : null } as const;
}
