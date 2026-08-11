import { useMemo, useState } from "react";
import type { Run } from "../api";
import EChart from "../components/EChart";
import { useFetch } from "../hooks";
import { filterQs, useFilters, useTheme } from "../main";
import { chartBase, e2eTps, fmt, STATUS, tooltipStyle } from "../theme";

function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-32 shrink-0 text-ink3">{label}</span>
      <span className={`text-ink ${mono ? "font-mono" : ""}`}>{children}</span>
    </div>
  );
}

export default function RunDetail({ id }: { id: string }) {
  const { data: run, error, loading } = useFetch<Run>(`/api/run/${id}`);
  const { filters } = useFilters();
  const { t } = useTheme();
  const [copied, setCopied] = useState(false);

  const stripOption = useMemo(() => {
    const samples = run?.samples ?? [];
    return {
      ...chartBase(t),
      grid: { left: 55, right: 20, top: 15, bottom: 30 },
      tooltip: {
        ...tooltipStyle(t),
        formatter: (p: { data: [number, number] }) =>
          `iteration ${p.data[0]}: <b style="color:${t.primary}">${p.data[1]}</b> tok/s`,
      },
      xAxis: {
        type: "value",
        name: "iteration",
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: t.muted },
        minInterval: 1,
        axisLine: { lineStyle: { color: t.axis } },
        splitLine: { show: false },
        axisLabel: { color: t.muted },
      },
      yAxis: {
        type: "value",
        name: "tok/s",
        nameTextStyle: { color: t.muted },
        scale: true,
        splitLine: { lineStyle: { color: t.grid } },
        axisLabel: { color: t.muted },
      },
      series: [
        {
          type: "scatter",
          data: samples.map((v, i) => [i, v]),
          symbolSize: 9,
          itemStyle: { color: t.series, borderColor: t.surface, borderWidth: 1 },
        },
      ],
    };
  }, [run, t]);

  if (error) return <p className="text-danger">{error}</p>;
  if (loading || !run) return <p className="text-ink3">loading…</p>;

  const copy = () => {
    navigator.clipboard.writeText(run.cmdline).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-3 text-[12px]">
        <a
          href={`#/config/${run.config_hash}${filterQs(filters)}`}
          className="text-ink2 hover:text-ink"
        >
          ← runs of {run.config_hash}
        </a>
        <span className="font-mono text-ink">run #{run.id}</span>
        {run.excluded ? <span className="text-danger">excluded</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-x-8 text-[12px] mb-3">
        <div>
          <Field label="config" mono>
            {run.config_hash}
          </Field>
          <Field label="session / repeat" mono>
            {run.session_id} / {run.repeat_idx}
          </Field>
          <Field label="commit" mono>
            {run.commit_hash}
            {run.dirty ? " (dirty)" : ""}
          </Field>
          <Field label="branch" mono>
            {run.branch}
          </Field>
          <Field label="device">{run.device}</Field>
          <Field label="driver" mono>
            {run.driver_ver}
          </Field>
          <Field label="freq pinned">{run.freq_pinned ? "yes" : "no"}</Field>
        </div>
        <div>
          <Field label="decode tps">{fmt(run.decode_tps)}</Field>
          <Field label="prefill tps">{fmt(run.prefill_tps, 1)}</Field>
          <Field label="e2e tps">
            {fmt(e2eTps(run.prefill_tps, run.decode_tps), 1)}
            <span className="text-ink3"> (2048p + 1024d)</span>
          </Field>
          <Field label="temp start→end">
            {run.temp_start_mc != null ? (run.temp_start_mc / 1000).toFixed(1) : "—"} →{" "}
            {run.temp_end_mc != null ? (run.temp_end_mc / 1000).toFixed(1) : "—"} °C
          </Field>
          <Field label="battery">{run.battery_pct != null ? `${run.battery_pct}%` : "—"}</Field>
          <Field label="quality">
            {(run.quality?.length ?? 0) > 0 ? (
              <>
                <span style={{ color: STATUS.warning }}>⚠</span> {run.quality.join(" · ")}
              </>
            ) : (
              "no flags"
            )}
          </Field>
          <Field label="timestamp" mono>
            {new Date(run.ts * 1000).toISOString()}
          </Field>
          <Field label="params" mono>
            {JSON.stringify(run.params)}
          </Field>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wide text-ink3">cmdline</span>
          <button
            type="button"
            onClick={copy}
            className="px-2 py-0.5 rounded border border-edge text-[11px] text-ink2 hover:bg-raised"
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="bg-surface border border-edge rounded p-2 font-mono text-[12px] text-ink whitespace-pre-wrap break-all">
          {run.cmdline}
        </pre>
      </div>

      <div>
        <span className="text-[11px] uppercase tracking-wide text-ink3">
          per-iteration samples (n={run.samples?.length ?? 0})
        </span>
        {run.samples?.length ? (
          <EChart option={stripOption} height={260} />
        ) : (
          <p className="text-ink3 text-[12px] mt-1">no samples recorded</p>
        )}
      </div>
    </div>
  );
}
