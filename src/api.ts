export type Filters = { device?: string; branch?: string; driver_ver?: string; model?: string };

export type ConfigStat = {
  config_hash: string;
  commit_hash: string;
  branch: string;
  device: string;
  driver_ver: string;
  model: string | null;
  n: number;
  mean_tps: number | null;
  sd_tps: number | null;
  cov_pct: number | null;
  prefill_mean: number | null;
  prefill_sd: number | null;
  quality: string[];
};

export type Run = {
  id: number;
  ts: number;
  config_hash: string;
  session_id: string;
  repeat_idx: number;
  commit_hash: string;
  branch: string;
  dirty: number;
  device: string;
  driver_ver: string;
  freq_pinned: number;
  temp_start_mc: number | null;
  temp_end_mc: number | null;
  battery_pct: number | null;
  cmdline: string;
  params: Record<string, unknown>;
  decode_tps: number | null;
  prefill_tps: number | null;
  samples: number[] | null;
  excluded: number;
  quality: string[];
};

export type TrendPoint = {
  commit_hash: string;
  first_seen_ts: number;
  n: number;
  decode_mean: number;
  decode_sd: number;
  prefill_mean: number;
  prefill_sd: number;
  e2e_mean: number | null;
  e2e_sd: number | null;
};

export type SweepCell = { m: number; n: number; k: number; mean: number; n_runs: number };

export type SweepTrendPoint = {
  commit_hash: string;
  first_seen_ts: number;
  tile_m: number;
  tile_n: number;
  tile_k: number;
  mean: number;
  sd: number | null;
  n: number;
};

export type MetaCat = {
  devices: string[];
  branches: string[];
  driver_vers: string[];
  models: string[];
  commits: string[];
  combos: { device: string; branch: string; driver_ver: string; model: string | null }[];
};

export type Meta = {
  e2e: MetaCat & { top: { device: string; branch: string; model: string } | null };
  sweep: MetaCat & { pairs: { commit_hash: string; device: string }[] };
};

export type CompareCell = {
  facet: string | null;
  x: string;
  series: string | null;
  commit_hash: string;
  n: number;
  mean: number;
  sd: number | null;
};

export function qs(params: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== "" && v !== false) p.set(k, String(v === true ? 1 : v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const message = body && typeof body === "object" && "error" in body ? body.error : undefined;
    throw new Error(typeof message === "string" ? message : `${res.status} ${res.statusText}`);
  }
  return res.json();
}
