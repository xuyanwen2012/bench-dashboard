import type { CustomSeriesRenderItemAPI } from "echarts";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CompareCell, Meta } from "../api";
import { qs } from "../api";
import EChart from "../components/EChart";
import { useFetch } from "../hooks";
import { useFilters, useTheme } from "../main";
import {
  CAT_DARK,
  CAT_LIGHT,
  chartBase,
  fmt,
  modelLabel,
  modelSize,
  shortHash,
  tooltipStyle,
} from "../theme";

const DIMS = ["model", "branch", "device", "driver_ver"] as const;
type Dim = (typeof DIMS)[number];
const DIM_LABEL: Record<Dim, string> = {
  model: "model",
  branch: "branch",
  device: "device",
  driver_ver: "driver",
};
const METRICS = ["decode", "prefill", "e2e"] as const;
type Metric = (typeof METRICS)[number];

type Criteria = {
  metric: Metric;
  x: Dim;
  series: Dim | "";
  fixed: Partial<Record<Dim, string>>;
};

const ANY = "__any__"; // shadcn Select cannot represent an empty-string value

function readCriteria(meta: Meta | null): Criteria {
  const query = location.hash.split("?")[1] ?? "";
  const p = new URLSearchParams(query);
  const metric = (METRICS as readonly string[]).includes(p.get("metric") ?? "")
    ? (p.get("metric") as Metric)
    : "prefill";
  const x = (DIMS as readonly string[]).includes(p.get("x") ?? "") ? (p.get("x") as Dim) : "model";
  const sRaw = p.get("series") ?? "branch";
  const series = (DIMS as readonly string[]).includes(sRaw) && sRaw !== x ? (sRaw as Dim) : "";
  const fixed: Partial<Record<Dim, string>> = {};
  for (const d of DIMS) {
    if (d === x || d === series) continue;
    const v = p.get(d);
    if (v) fixed[d] = v;
  }
  // default the device (the dimension most comparisons fix) to the primary
  // benchmarking device — the one carrying the tile sweeps — when unset
  if (!fixed.device && x !== "device" && series !== "device" && meta) {
    const primary = meta.sweep.pairs.at(-1)?.device ?? meta.e2e.devices[0];
    if (primary) fixed.device = primary;
  }
  return { metric, x, series, fixed };
}

function writeCriteria(c: Criteria) {
  const p = new URLSearchParams();
  p.set("metric", c.metric);
  p.set("x", c.x);
  if (c.series) p.set("series", c.series);
  for (const [k, v] of Object.entries(c.fixed)) if (v) p.set(k, v);
  history.replaceState(null, "", `#/compare?${p.toString()}`);
}

const xLabel = (dim: Dim, v: string) => (dim === "model" ? modelLabel(v) : v);

export default function Compare() {
  const { meta } = useFilters();
  const { t, dark } = useTheme();
  const [criteria, setCriteria] = useState<Criteria>(() => readCriteria(meta));

  // meta arrives async on first load; re-derive the device default once
  const c = useMemo(
    () =>
      criteria.fixed.device || criteria.x === "device" || criteria.series === "device"
        ? criteria
        : readCriteria(meta),
    [criteria, meta],
  );

  const update = (next: Criteria) => {
    // keep axes disjoint and drop fixed values that collide with an axis
    if (next.series === next.x) next.series = "";
    for (const d of DIMS) if (d === next.x || d === next.series) delete next.fixed[d];
    writeCriteria(next);
    setCriteria(next);
  };

  const { data, error, loading } = useFetch<CompareCell[]>(
    `/api/compare${qs({ metric: c.metric, x: c.x, series: c.series || undefined, ...c.fixed })}`,
  );
  const cells = data ?? [];

  const xs = useMemo(() => {
    const vals = [...new Set(cells.map((r) => r.x))];
    return c.x === "model" ? vals.sort((a, b) => modelSize(a) - modelSize(b)) : vals.sort();
  }, [cells, c.x]);
  const seriesVals = useMemo(() => [...new Set(cells.map((r) => r.series ?? ""))].sort(), [cells]);
  const byKey = useMemo(() => new Map(cells.map((r) => [`${r.x}|${r.series ?? ""}`, r])), [cells]);

  const metaValues = (d: Dim): string[] =>
    d === "model"
      ? (meta?.e2e.models ?? [])
      : d === "branch"
        ? (meta?.e2e.branches ?? [])
        : d === "device"
          ? (meta?.e2e.devices ?? [])
          : (meta?.e2e.driver_vers ?? []);

  const cat = dark ? CAT_DARK : CAT_LIGHT;

  const option = useMemo(() => {
    const S = Math.max(seriesVals.length, 1);
    const barSeries = seriesVals.map((sv, si) => ({
      name: sv || c.metric,
      type: "bar",
      barCategoryGap: "30%",
      barGap: "10%",
      itemStyle: { color: cat[si % cat.length], borderRadius: [4, 4, 0, 0] },
      data: xs.map((xv) => byKey.get(`${xv}|${sv}`)?.mean ?? null),
    }));
    // ±sd whiskers as a custom series per bar series, positioned on the bar layout
    const whiskers = seriesVals.map((sv, si) => ({
      name: `${sv || c.metric} sd`,
      type: "custom",
      silent: true,
      z: 10,
      data: xs
        .map((xv, xi) => {
          const cell = byKey.get(`${xv}|${sv}`);
          return cell?.sd ? [xi, cell.mean - cell.sd, cell.mean + cell.sd] : null;
        })
        .filter(Boolean),
      renderItem: (_params: unknown, api: CustomSeriesRenderItemAPI) => {
        const xi = api.value(0);
        const lo = api.coord([xi, api.value(1)]);
        const hi = api.coord([xi, api.value(2)]);
        // api.size() is optional per echarts' types (not all coord systems implement it)
        // but is always present for this cartesian bar chart; it returns a single number
        // for a scalar input and an array for the 2-element vector input we pass here
        const band = (api.size?.([1, 0]) as number[] | undefined)?.[0] ?? 0;
        const usable = band * 0.7;
        const barW = usable / (S + 0.1 * (S - 1));
        const cx = lo[0] - usable / 2 + barW * (si + 0.5) + 0.1 * barW * si;
        const cap = barW * 0.4;
        const style = { stroke: t.secondary, lineWidth: 1.5, fill: null as null };
        return {
          type: "group",
          children: [
            { type: "line", shape: { x1: cx, y1: lo[1], x2: cx, y2: hi[1] }, style },
            {
              type: "line",
              shape: { x1: cx - cap / 2, y1: hi[1], x2: cx + cap / 2, y2: hi[1] },
              style,
            },
            {
              type: "line",
              shape: { x1: cx - cap / 2, y1: lo[1], x2: cx + cap / 2, y2: lo[1] },
              style,
            },
          ],
        };
      },
    }));
    return {
      ...chartBase(t),
      grid: { left: 60, right: 20, top: seriesVals.some(Boolean) ? 36 : 20, bottom: 30 },
      legend: seriesVals.some(Boolean)
        ? {
            top: 4,
            data: seriesVals, // whisker series stay out of the legend
            textStyle: { color: t.secondary },
            itemWidth: 12,
            itemHeight: 12,
          }
        : { show: false },
      tooltip: {
        ...tooltipStyle(t),
        formatter: (p: { seriesName: string; dataIndex: number }) => {
          const cell = byKey.get(
            `${xs[p.dataIndex]}|${seriesVals.length && p.seriesName !== c.metric ? p.seriesName : ""}`,
          );
          if (!cell) return "";
          return (
            `${xLabel(c.x, cell.x)}${cell.series ? ` · ${cell.series}` : ""}<br/>` +
            `<span style="font-family:monospace">${cell.commit_hash}</span><br/>` +
            `${c.metric} <b style="color:${t.primary}">${fmt(cell.mean)}</b> ± ${fmt(cell.sd)} tok/s · n=${cell.n}`
          );
        },
      },
      xAxis: {
        type: "category",
        data: xs.map((v) => xLabel(c.x, v)),
        axisLine: { lineStyle: { color: t.axis } },
        axisTick: { show: false },
        axisLabel: { color: t.muted, fontFamily: c.x === "model" ? undefined : "monospace" },
      },
      yAxis: {
        type: "value",
        name: `${c.metric} tok/s`,
        nameTextStyle: { color: t.muted, align: "left" },
        splitLine: { lineStyle: { color: t.grid } },
        axisLabel: { color: t.muted },
      },
      series: [...barSeries, ...whiskers],
    };
  }, [xs, seriesVals, byKey, c.metric, c.x, t, cat]);

  const DimSelect = ({
    value,
    onChange,
    options,
    allowNone,
    width = "w-36",
  }: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    allowNone?: boolean;
    width?: string;
  }) => (
    <Select
      value={value || (allowNone ? ANY : value)}
      onValueChange={(v) => onChange(v === ANY ? "" : v)}
    >
      <SelectTrigger size="sm" className={`${width} font-mono text-[12px]`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={ANY}>none</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="font-mono text-[12px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const fixedDims = DIMS.filter((d) => d !== c.x && d !== c.series);
  const pooled = fixedDims.filter((d) => !c.fixed[d] && metaValues(d).length > 1);

  return (
    <div className="max-w-5xl space-y-3">
      <Card className="py-3 gap-2">
        <CardHeader className="px-4">
          <CardTitle className="text-[12px] uppercase tracking-wide text-ink3 font-normal">
            comparison criteria
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 flex flex-wrap items-end gap-4 text-[12px]">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: DimSelect renders a Radix SelectTrigger <button>, a labelable element biome can't see through */}
          <label className="space-y-1">
            <div className="text-ink3">metric</div>
            <DimSelect
              width="w-28"
              value={c.metric}
              onChange={(v) => update({ ...c, metric: v as Metric })}
              options={METRICS.map((m) => ({ value: m, label: m }))}
            />
          </label>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: DimSelect renders a Radix SelectTrigger <button>, a labelable element biome can't see through */}
          <label className="space-y-1">
            <div className="text-ink3">x axis</div>
            <DimSelect
              width="w-28"
              value={c.x}
              onChange={(v) => update({ ...c, x: v as Dim, fixed: { ...c.fixed } })}
              options={DIMS.map((d) => ({ value: d, label: DIM_LABEL[d] }))}
            />
          </label>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: DimSelect renders a Radix SelectTrigger <button>, a labelable element biome can't see through */}
          <label className="space-y-1">
            <div className="text-ink3">series (color)</div>
            <DimSelect
              width="w-28"
              value={c.series}
              allowNone
              onChange={(v) => update({ ...c, series: v as Dim | "", fixed: { ...c.fixed } })}
              options={DIMS.filter((d) => d !== c.x).map((d) => ({
                value: d,
                label: DIM_LABEL[d],
              }))}
            />
          </label>
          <div className="h-8 w-px bg-edge" />
          {fixedDims.map((d) => (
            // biome-ignore lint/a11y/noLabelWithoutControl: DimSelect renders a Radix SelectTrigger <button>, a labelable element biome can't see through
            <label key={d} className="space-y-1">
              <div className="text-ink3">{DIM_LABEL[d]}</div>
              <DimSelect
                value={c.fixed[d] ?? ""}
                allowNone
                onChange={(v) => update({ ...c, fixed: { ...c.fixed, [d]: v || undefined } })}
                options={metaValues(d).map((v) => ({
                  value: v,
                  label: d === "model" ? modelLabel(v) : v,
                }))}
              />
            </label>
          ))}
          {pooled.length > 0 && (
            <span className="text-ink3">
              ⚠ pooled across all {pooled.map((d) => DIM_LABEL[d]).join(", ")} values
            </span>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-danger text-[12px]">{error}</p>}
      {!loading && cells.length === 0 && !error && (
        <p className="text-ink3 text-[12px]">no runs match these criteria</p>
      )}
      {cells.length > 0 && <EChart option={option} height={360} />}

      {cells.length > 0 && (
        <Card className="py-3 gap-2">
          <CardHeader className="px-4">
            <CardTitle className="text-[12px] uppercase tracking-wide text-ink3 font-normal">
              cells · latest commit per {c.x}
              {c.series ? ` × ${DIM_LABEL[c.series]}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-7 text-[11px] uppercase">{DIM_LABEL[c.x]}</TableHead>
                  {c.series && (
                    <TableHead className="h-7 text-[11px] uppercase">
                      {DIM_LABEL[c.series]}
                    </TableHead>
                  )}
                  <TableHead className="h-7 text-[11px] uppercase">commit</TableHead>
                  <TableHead className="h-7 text-[11px] uppercase text-right">n</TableHead>
                  <TableHead className="h-7 text-[11px] uppercase text-right">mean tok/s</TableHead>
                  <TableHead className="h-7 text-[11px] uppercase text-right">sd</TableHead>
                  <TableHead className="h-7 text-[11px] uppercase text-right">CoV%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {xs.flatMap((xv) =>
                  seriesVals.map((sv) => {
                    const cell = byKey.get(`${xv}|${sv}`);
                    return (
                      <TableRow key={`${xv}|${sv}`} className="text-[12px]">
                        <TableCell className="py-1">{xLabel(c.x, xv)}</TableCell>
                        {c.series && <TableCell className="py-1">{sv}</TableCell>}
                        <TableCell className="py-1 font-mono text-ink2">
                          {cell ? shortHash(cell.commit_hash) : "—"}
                        </TableCell>
                        <TableCell className="py-1 text-right tabular-nums">
                          {cell?.n ?? "—"}
                        </TableCell>
                        <TableCell className="py-1 text-right tabular-nums">
                          {cell ? fmt(cell.mean) : "—"}
                        </TableCell>
                        <TableCell className="py-1 text-right tabular-nums text-ink2">
                          {cell ? fmt(cell.sd) : "—"}
                        </TableCell>
                        <TableCell className="py-1 text-right tabular-nums">
                          {cell?.sd != null && cell.mean
                            ? fmt((100 * cell.sd) / cell.mean, 1)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  }),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
