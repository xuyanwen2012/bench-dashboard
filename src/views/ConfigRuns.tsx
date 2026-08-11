import { useState } from "react";
import type { Run } from "../api";
import { qs } from "../api";
import { useFetch } from "../hooks";
import { filterQs, useFilters } from "../main";
import { e2eTps, fmt, STATUS, shortHash, stats } from "../theme";

export default function ConfigRuns({ configHash }: { configHash: string }) {
  const { filters } = useFilters();
  const [showExcluded, setShowExcluded] = useState(false);
  const { data, error, loading } = useFetch<Run[]>(
    `/api/runs${qs({ config_hash: configHash, include_excluded: showExcluded })}`,
  );

  if (error) return <p className="text-danger">{error}</p>;
  if (loading) return <p className="text-ink3">loading…</p>;

  const runs = data ?? [];
  const first = runs[0];

  // aggregates over non-excluded runs, regardless of the show-excluded toggle
  const included = runs.filter((r) => !r.excluded);
  const agg = [
    {
      label: "decode",
      ...stats(included.map((r) => r.decode_tps).filter((v): v is number => v != null)),
    },
    {
      label: "prefill",
      ...stats(included.map((r) => r.prefill_tps).filter((v): v is number => v != null)),
    },
    {
      label: "e2e (2048p+1024d)",
      ...stats(
        included
          .map((r) => e2eTps(r.prefill_tps, r.decode_tps))
          .filter((v): v is number => v != null),
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-[12px]">
        <a href={`#/configs${filterQs(filters)}`} className="text-ink2 hover:text-ink">
          ← configs
        </a>
        <span className="font-mono text-ink">{configHash}</span>
        {first && (
          <span className="text-ink3">
            {first.device} · <span className="font-mono">{shortHash(first.commit_hash)}</span> ·{" "}
            {first.branch}
          </span>
        )}
        <label className="ml-auto flex items-center gap-1 text-ink2">
          <input
            type="checkbox"
            checked={showExcluded}
            onChange={(e) => setShowExcluded(e.target.checked)}
          />
          show excluded
        </label>
      </div>

      <div className="mb-3 border border-edge rounded bg-surface px-3 py-2 max-w-xl">
        <div className="text-[11px] uppercase tracking-wide text-ink3 mb-1">
          aggregate · n={included.length} non-excluded runs
        </div>
        <table className="border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink3">
              <th className="pr-6 py-0.5">metric</th>
              <th className="pr-6 py-0.5 text-right">mean tok/s</th>
              <th className="pr-6 py-0.5 text-right">sd</th>
              <th className="py-0.5 text-right">CoV%</th>
            </tr>
          </thead>
          <tbody>
            {agg.map((a) => (
              <tr key={a.label}>
                <td className="pr-6 py-0.5 text-ink2">{a.label}</td>
                <td className="pr-6 py-0.5 text-right tabular-nums text-ink">{fmt(a.mean)}</td>
                <td className="pr-6 py-0.5 text-right tabular-nums text-ink2">{fmt(a.sd)}</td>
                <td className="py-0.5 text-right tabular-nums">{fmt(a.cov, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink3 border-b border-edge">
            <th className="px-2 py-1">run</th>
            <th className="px-2 py-1 text-right">repeat</th>
            <th className="px-2 py-1">session</th>
            <th className="px-2 py-1 text-right">decode tps</th>
            <th className="px-2 py-1 text-right">prefill tps</th>
            <th className="px-2 py-1 text-right">e2e tps</th>
            <th className="px-2 py-1 text-right">temp start/end °C</th>
            <th className="px-2 py-1 text-right">batt%</th>
            <th className="px-2 py-1">flags</th>
            <th className="px-2 py-1">excl</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr
              key={r.id}
              onClick={() => (location.hash = `#/run/${r.id}`)}
              className={`border-b border-edge-soft hover:bg-raised cursor-pointer ${r.excluded ? "opacity-50" : ""}`}
            >
              <td className="px-2 py-0.5 font-mono text-ink">#{r.id}</td>
              <td className="px-2 py-0.5 text-right tabular-nums">{r.repeat_idx}</td>
              <td className="px-2 py-0.5 font-mono text-ink2">{r.session_id}</td>
              <td className="px-2 py-0.5 text-right tabular-nums">{fmt(r.decode_tps)}</td>
              <td className="px-2 py-0.5 text-right tabular-nums">{fmt(r.prefill_tps, 1)}</td>
              <td className="px-2 py-0.5 text-right tabular-nums">
                {fmt(e2eTps(r.prefill_tps, r.decode_tps), 1)}
              </td>
              <td className="px-2 py-0.5 text-right tabular-nums text-ink2">
                {r.temp_start_mc != null ? (r.temp_start_mc / 1000).toFixed(1) : "—"} →{" "}
                {r.temp_end_mc != null ? (r.temp_end_mc / 1000).toFixed(1) : "—"}
              </td>
              <td className="px-2 py-0.5 text-right tabular-nums text-ink2">
                {r.battery_pct ?? "—"}
              </td>
              <td className="px-2 py-0.5">
                {(r.quality?.length ?? 0) > 0 && (
                  <span
                    className="px-1 rounded text-[11px] text-ink2 border border-edge whitespace-nowrap"
                    title={r.quality.join(" · ")}
                  >
                    <span style={{ color: STATUS.warning }}>⚠</span> {r.quality.join(" · ")}
                  </span>
                )}
              </td>
              <td className="px-2 py-0.5">{r.excluded ? "yes" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
