import { useEffect, useMemo } from "react";
import type { SweepTrendPoint } from "../api";
import { qs } from "../api";
import EChart from "../components/EChart";
import { useFetch } from "../hooks";
import { useFilters, useTheme } from "../main";
import {
  chartBase,
  SHIFT_Z,
  shiftColor,
  shiftGlyph,
  shiftText,
  shiftVsPrev,
  shortHash,
  tooltipStyle,
} from "../theme";

// Best tile per commit, by mean prefill tok/s — tracks whether the sweep's
// achievable peak moves across commits for the selected device.
export default function SweepTrend() {
  const { filters, setFilters, meta } = useFilters();
  const { t } = useTheme();

  useEffect(() => {
    if (!meta || filters.device) return;
    const device = meta.sweep.devices[0];
    if (device) setFilters({ ...filters, device });
  }, [meta, filters, setFilters]);

  // best-tile-per-commit over several devices would mix GPUs; require one
  const multiDevice = (filters.device ?? "").includes(",");
  const ready = !!filters.device && !multiDevice;
  const { data, error } = useFetch<SweepTrendPoint[]>(
    ready
      ? `/api/sweeptrend${qs({
          device: filters.device,
          branch: filters.branch,
          driver_ver: filters.driver_ver,
          model: filters.model,
        })}`
      : null,
  );
  const pts = data ?? [];

  const option = useMemo(() => {
    const commits = pts.map((p) => shortHash(p.commit_hash));
    const mean = pts.map((p) => p.mean);
    const sd = pts.map((p) => p.sd ?? 0);
    const lower = mean.map((m, i) => m - sd[i]);
    const bandWidth = sd.map((s) => 2 * s);
    const shifts = shiftVsPrev(pts);
    const tileChanged = (i: number) => {
      const prev = pts[i - 1];
      const p = pts[i];
      return (
        !!prev &&
        !!p &&
        (prev.tile_m !== p.tile_m || prev.tile_n !== p.tile_n || prev.tile_k !== p.tile_k)
      );
    };
    return {
      ...chartBase(t),
      grid: { left: 55, right: 20, top: 26, bottom: 24 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: t.axis } },
        ...tooltipStyle(t),
        formatter: (params: { dataIndex: number }[]) => {
          const i = params[0]?.dataIndex;
          const p = pts[i];
          if (!p) return "";
          const cov = p.mean ? (100 * (p.sd ?? 0)) / p.mean : 0;
          const sh = shifts[i];
          return (
            `<span style="font-family:monospace">${p.commit_hash}</span><br/>` +
            `best tile m=${p.tile_m} n=${p.tile_n} k=${p.tile_k}<br/>` +
            `prefill mean <b style="color:${t.primary}">${p.mean.toFixed(1)}</b> tok/s · sd ${(p.sd ?? 0).toFixed(1)}<br/>` +
            `n=${p.n} · CoV ${cov.toFixed(1)}%` +
            (sh
              ? `<br/><span style="color:${shiftColor(sh)}">${shiftGlyph(sh)}</span> ${shiftText(sh)}${
                  tileChanged(i) ? " · best tile changed" : ""
                }`
              : "")
          );
        },
      },
      xAxis: {
        type: "category",
        data: commits,
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.muted, fontFamily: "monospace" },
      },
      yAxis: {
        type: "value",
        name: "best-tile prefill tok/s",
        nameTextStyle: { color: t.muted, align: "left" },
        scale: true,
        splitLine: { lineStyle: { color: t.grid } },
        axisLabel: { color: t.muted },
      },
      series: [
        // invisible base + band = mean ± sd
        {
          type: "line",
          data: lower,
          stack: "sweep",
          symbol: "none",
          lineStyle: { opacity: 0 },
          silent: true,
        },
        {
          type: "line",
          data: bandWidth,
          stack: "sweep",
          symbol: "none",
          lineStyle: { opacity: 0 },
          areaStyle: { color: t.band },
          silent: true,
        },
        {
          type: "line",
          // flagged points swap shape as well as color, so the mark never
          // relies on color alone: ▲/▼ status triangle vs the series circle
          data: mean.map((m, i) => {
            const sh = shifts[i];
            if (!sh) return m;
            return {
              value: m,
              symbol: "triangle",
              symbolRotate: sh.dir < 0 ? 180 : 0,
              symbolSize: 11,
              itemStyle: { color: shiftColor(sh), borderColor: t.surface, borderWidth: 1 },
            };
          }),
          symbol: "circle",
          symbolSize: 8,
          itemStyle: { color: t.series },
          lineStyle: { color: t.series, width: 2 },
          label: {
            show: true,
            position: "top",
            fontSize: 10,
            color: t.muted,
            formatter: (p: { dataIndex: number }) => {
              const pt = pts[p.dataIndex];
              return pt ? `${pt.tile_m}×${pt.tile_n}×${pt.tile_k}` : "";
            },
          },
        },
      ],
    };
  }, [pts, t]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-[12px]">
        <span className="text-ink2">
          best tile per commit (labels = m×n×k), first-seen order · ▲/▼ = ≥{SHIFT_Z}σ shift vs
          previous commit
        </span>
        <span className="ml-auto text-ink3">
          prefill tok/s · {filters.device}
          {filters.model ? ` · ${filters.model}` : ""}
        </span>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {multiDevice && <p className="text-ink3">pick a single device for the sweep trend</p>}
      {ready && data && data.length === 0 && (
        <p className="text-ink3">no tile-sweep runs for these filters</p>
      )}
      {pts.length > 0 && <EChart option={option} height={280} />}
    </div>
  );
}
