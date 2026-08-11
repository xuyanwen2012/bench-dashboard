import { useEffect, useMemo, useState } from "react";
import type { SweepCell } from "../api";
import { qs } from "../api";
import EChart from "../components/EChart";
import { useFetch } from "../hooks";
import { useFilters, useTheme } from "../main";
import { chartBase, shortHash, tooltipStyle } from "../theme";

export default function TileSweep() {
  const { filters, setFilters, meta } = useFilters();
  const { t, dark } = useTheme();
  const [commit, setCommit] = useState<string>("");
  const [k, setK] = useState<number | null>(null);

  // keep (commit, device) pointing at a pair that actually has sweep data:
  // default to the newest such pair, and re-pick the commit when the shared
  // device filter changes and the current commit has no sweeps for it
  useEffect(() => {
    if (!meta) return;
    const forDev = filters.device
      ? meta.sweep.pairs.filter((s) => s.device === filters.device)
      : meta.sweep.pairs;
    if (forDev.some((s) => s.commit_hash === commit)) return; // current pick is valid
    const pick = forDev[forDev.length - 1];
    if (pick) {
      setCommit(pick.commit_hash);
      if (!filters.device) setFilters({ ...filters, device: pick.device });
    } else if (!commit) {
      setCommit(meta.sweep.commits[meta.sweep.commits.length - 1] ?? "");
      if (!filters.device) setFilters({ ...filters, device: meta.sweep.devices[0] });
    }
  }, [meta, commit, filters, setFilters]);

  // one heatmap = one commit on one device; several devices would mix GPUs
  const multiDevice = (filters.device ?? "").includes(",");
  const ready = !!(commit && filters.device) && !multiDevice;
  const { data, error } = useFetch<SweepCell[]>(
    ready ? `/api/tilesweep${qs({ commit, device: filters.device, model: filters.model })}` : null,
  );

  const cells = data ?? [];
  const ks = useMemo(() => [...new Set(cells.map((c) => c.k))].sort((a, b) => a - b), [cells]);
  const kSel = k != null && ks.includes(k) ? k : (ks[0] ?? null);

  const option = useMemo(() => {
    const sel = cells.filter((c) => c.k === kSel);
    const ms = [...new Set(sel.map((c) => c.m))].sort((a, b) => a - b);
    const ns = [...new Set(sel.map((c) => c.n))].sort((a, b) => a - b);
    const vals = sel.map((c) => c.mean);
    const lo = Math.min(...vals),
      hi = Math.max(...vals);
    const mid = (lo + hi) / 2;
    const byKey = new Map(sel.map((c) => [`${c.m}|${c.n}`, c]));
    // cell label must contrast with the cell fill: the "high" end of the ramp is
    // dark in light mode and light in dark mode
    const labelColor = (v: number) => {
      const highEnd = v > mid;
      if (dark) return highEnd ? "#0b0b0b" : "#ffffff";
      return highEnd ? "#ffffff" : "#0b0b0b";
    };
    return {
      ...chartBase(t),
      grid: { left: 70, right: 90, top: 20, bottom: 40 },
      tooltip: {
        ...tooltipStyle(t),
        formatter: (p: { data: number[] | { value: number[] } }) => {
          const v = "value" in p.data ? p.data.value : p.data; // data items are {value, label} objects
          const cell = byKey.get(`${ms[v[0]]}|${ns[v[1]]}`);
          return cell
            ? `tile m=${cell.m} n=${cell.n} k=${cell.k}<br/>prefill mean <b style="color:${t.primary}">${cell.mean.toFixed(1)}</b> tok/s · n=${cell.n_runs}`
            : "";
        },
      },
      xAxis: {
        type: "category",
        name: "tile m",
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: t.muted },
        data: ms.map(String),
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.muted, fontFamily: "monospace" },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        name: "tile n",
        nameTextStyle: { color: t.muted },
        data: ns.map(String),
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.muted, fontFamily: "monospace" },
        splitArea: { show: false },
      },
      visualMap: {
        min: lo,
        max: hi,
        calculable: false,
        orient: "vertical",
        right: 10,
        top: "center",
        inRange: { color: t.ramp },
        textStyle: { color: t.muted },
        formatter: (v: number) => v.toFixed(1),
      },
      series: [
        {
          type: "heatmap",
          data: sel.map((c) => ({
            value: [ms.indexOf(c.m), ns.indexOf(c.n), +c.mean.toFixed(2)],
            label: { color: labelColor(c.mean) },
          })),
          label: {
            show: true,
            fontSize: 10,
            formatter: (p: { data: { value: number[] } }) => p.data.value[2].toFixed(1),
          },
          itemStyle: { borderColor: t.surface, borderWidth: 2 },
          emphasis: { itemStyle: { borderColor: t.secondary } },
        },
      ],
    };
  }, [cells, kSel, t, dark]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-[12px]">
        <label className="flex items-center gap-1.5 text-ink2">
          commit
          <select
            className="bg-surface border border-edge rounded px-1.5 py-0.5 font-mono text-ink"
            value={commit}
            onChange={(e) => setCommit(e.target.value)}
          >
            {[...new Set((meta?.sweep.pairs ?? []).map((s) => s.commit_hash))].map((c) => (
              <option key={c} value={c}>
                {shortHash(c)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-ink2">k</span>
        {ks.map((kv) => (
          <button
            key={kv}
            type="button"
            onClick={() => setK(kv)}
            className={`px-2 py-0.5 rounded border font-mono ${
              kSel === kv ? "border-edge bg-raised text-ink" : "border-edge text-ink2"
            }`}
          >
            {kv}
          </button>
        ))}
        <span className="ml-auto text-ink3">
          prefill tok/s · {filters.device}
          {filters.model ? ` · ${filters.model}` : ""}
        </span>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {multiDevice && <p className="text-ink3">pick a single device for the heatmap</p>}
      {ready && cells.length === 0 && (
        <p className="text-ink3">no tile-sweep runs for this commit+device</p>
      )}
      {cells.length > 0 && <EChart option={option} height={440} />}
    </div>
  );
}
