import { useEffect, useMemo, useState } from "react";
import type { TrendPoint } from "../api";
import { qs } from "../api";
import EChart from "../components/EChart";
import { useFetch } from "../hooks";
import { useFilters, useTheme } from "../main";
import {
  type ChartTokens,
  chartBase,
  SHIFT_Z,
  shiftColor,
  shiftGlyph,
  shiftText,
  shiftVsPrev,
  shortHash,
  tooltipStyle,
} from "../theme";

const METRICS = [
  { key: "e2e", label: "e2e", digits: 1 },
  { key: "prefill", label: "prefill", digits: 1 },
  { key: "decode", label: "decode", digits: 2 },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

function panelOption(t: ChartTokens, pts: TrendPoint[], metric: MetricKey, digits: number) {
  const commits = pts.map((p) => shortHash(p.commit_hash));
  const mean = pts.map((p) => p[`${metric}_mean`]);
  const sd = pts.map((p) => p[`${metric}_sd`] ?? 0);
  const lower = mean.map((m, i) => (m == null ? null : m - sd[i]));
  const bandWidth = sd.map((s) => 2 * s);
  const shifts = shiftVsPrev(
    pts.map((p) => ({ mean: p[`${metric}_mean`], sd: p[`${metric}_sd`], n: p.n })),
  );
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
        const m = mean[i];
        if (!p || m == null) return "";
        const s = sd[i];
        const cov = m ? (100 * s) / m : 0;
        const sh = shifts[i];
        return (
          `<span style="font-family:monospace">${p.commit_hash}</span><br/>` +
          `${metric} mean <b style="color:${t.primary}">${m.toFixed(digits)}</b> tok/s · sd ${s.toFixed(digits)}<br/>` +
          `n=${p.n} · CoV ${cov.toFixed(1)}%` +
          (sh
            ? `<br/><span style="color:${shiftColor(sh)}">${shiftGlyph(sh)}</span> ${shiftText(sh)}`
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
      name: `${metric} tok/s`,
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
        stack: metric,
        symbol: "none",
        lineStyle: { opacity: 0 },
        silent: true,
      },
      {
        type: "line",
        data: bandWidth,
        stack: metric,
        symbol: "none",
        lineStyle: { opacity: 0 },
        areaStyle: { color: t.band },
        silent: true,
      },
      {
        type: "line",
        // flagged points swap shape as well as color, so the mark never relies
        // on color alone: ▲/▼ status triangle vs the plain series circle
        data: mean.map((m, i) => {
          const sh = shifts[i];
          if (m == null || !sh) return m;
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
      },
    ],
  };
}

export default function Trend() {
  const { filters, setFilters, meta } = useFilters();
  const { t } = useTheme();
  const [visible, setVisible] = useState<Record<MetricKey, boolean>>({
    e2e: true,
    prefill: true,
    decode: true,
  });

  // trend is per device+branch+model (mixing model sizes in one mean is
  // meaningless); default the shared filters to the first of each
  useEffect(() => {
    if (!meta) return;
    const needModel = meta.e2e.models.length > 0 && !filters.model;
    if (!filters.device || !filters.branch || needModel) {
      setFilters({
        ...filters,
        device: filters.device || meta.e2e.top?.device || meta.e2e.devices[0],
        branch: filters.branch || meta.e2e.top?.branch || meta.e2e.branches[0],
        model: filters.model || meta.e2e.top?.model || meta.e2e.models[0],
      });
    }
  }, [meta, filters, setFilters]);

  // a per-commit mean over several devices/branches/models is meaningless —
  // multi-selections (comma-joined) block the fetch instead of pooling silently
  const multi = (["device", "branch", "model"] as const).filter((k) =>
    (filters[k] ?? "").includes(","),
  );
  const ready = !!(
    filters.device &&
    filters.branch &&
    (filters.model || !meta?.e2e.models.length) &&
    multi.length === 0
  );
  const { data, error } = useFetch<TrendPoint[]>(
    ready
      ? `/api/trend${qs({ device: filters.device, branch: filters.branch, driver_ver: filters.driver_ver, model: filters.model })}`
      : null,
  );
  const pts = data ?? [];

  const options = useMemo(
    () =>
      Object.fromEntries(
        METRICS.map((m) => [m.key, panelOption(t, pts, m.key, m.digits)]),
      ) as Record<MetricKey, object>,
    [pts, t],
  );

  const shown = METRICS.filter((m) => visible[m.key]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-[12px]">
        <span className="text-ink2">metrics</span>
        {METRICS.map((m) => (
          <label key={m.key} className="flex items-center gap-1 text-ink2">
            <input
              type="checkbox"
              checked={visible[m.key]}
              onChange={(e) => setVisible({ ...visible, [m.key]: e.target.checked })}
            />
            {m.label}
          </label>
        ))}
        <span className="ml-auto text-ink3">
          mean ± sd per commit, first-seen order · ▲/▼ = ≥{SHIFT_Z}σ shift vs previous commit · e2e
          = 3072 tok / (2048/prefill + 1024/decode) · {filters.device} · {filters.branch} ·{" "}
          {filters.model ?? "all models"}
        </span>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {multi.length > 0 && (
        <p className="text-ink3">
          trend aggregates one device+branch+model at a time — pick a single {multi.join(", ")}{" "}
          above (compare handles side-by-side)
        </p>
      )}
      {ready && data && data.length === 0 && (
        <p className="text-ink3">no runs for this device+branch+model</p>
      )}
      {shown.length === 0 && <p className="text-ink3">all metrics hidden — check one above</p>}
      {pts.length > 0 &&
        shown.map((m) => <EChart key={m.key} option={options[m.key]} height={230} />)}
    </div>
  );
}
