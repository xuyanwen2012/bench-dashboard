import { useState } from "react";
import type { ConfigStat } from "../api";
import { useFetch } from "../hooks";
import { filterQs, useFilters } from "../main";
import { fmt, modelLabel, modelSize, STATUS, shortHash } from "../theme";

const N_MIN = 5; // under-sampled below this
const COV_MAX = 5; // noisy above this (%)

const flagCount = (r: ConfigStat) =>
  (r.n < N_MIN ? 1 : 0) +
  (r.cov_pct != null && r.cov_pct > COV_MAX ? 1 : 0) +
  (r.quality?.length ?? 0);

// One entry per column; `value` yields the sort key (numbers sort numerically,
// strings lexically, nulls always last).
type Col = {
  key: string;
  label: string;
  right?: boolean;
  value: (r: ConfigStat) => string | number | null;
};

// commit leads: it is the axis results move along, while config_hash is an
// opaque per-commit id (kept, muted, since it names the row's run set)
const COLS: Col[] = [
  { key: "commit", label: "commit", value: (r) => r.commit_hash },
  { key: "config", label: "config", value: (r) => r.config_hash },
  { key: "model", label: "model", value: (r) => (r.model ? modelSize(r.model) : null) },
  { key: "device", label: "device", value: (r) => r.device },
  { key: "driver", label: "driver", value: (r) => r.driver_ver },
  { key: "n", label: "n", right: true, value: (r) => r.n },
  { key: "decode", label: "decode", right: true, value: (r) => r.mean_tps },
  { key: "decode_sd", label: "sd", right: true, value: (r) => r.sd_tps },
  { key: "cov", label: "CoV%", right: true, value: (r) => r.cov_pct },
  { key: "prefill", label: "prefill", right: true, value: (r) => r.prefill_mean },
  { key: "prefill_sd", label: "sd", right: true, value: (r) => r.prefill_sd },
  { key: "flags", label: "flags", value: flagCount },
];

type Sort = { key: string; dir: 1 | -1 } | null;

export default function Configs() {
  const { filters } = useFilters();
  const [sort, setSort] = useState<Sort>(null);
  const { data, error, loading } = useFetch<ConfigStat[]>(`/api/configs${filterQs(filters)}`);

  if (error) return <p className="text-danger">{error}</p>;
  if (loading) return <p className="text-ink3">loading…</p>;

  // clicking a header cycles: ascending → descending → default (API order)
  const clickCol = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));

  const rows = [...(data ?? [])];
  if (sort) {
    const col = COLS.find((c) => c.key === sort.key);
    if (col)
      rows.sort((a, b) => {
        const va = col.value(a);
        const vb = col.value(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1; // nulls last in either direction
        if (vb == null) return -1;
        const cmp =
          typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb));
        return sort.dir * cmp;
      });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-[12px]">
        <span className="text-ink3">click a column to sort · asc → desc → default</span>
        <span className="ml-auto text-ink3">{rows.length} configs</span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink3 border-b border-edge">
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => clickCol(c.key)}
                aria-sort={
                  sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"
                }
                className={`px-2 py-1 cursor-pointer select-none hover:text-ink ${
                  c.right ? "text-right" : ""
                } ${sort?.key === c.key ? "text-ink" : ""}`}
              >
                {c.label}
                {sort?.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.config_hash}
              onClick={() => (location.hash = `#/config/${r.config_hash}${filterQs(filters)}`)}
              className="border-b border-edge-soft hover:bg-raised cursor-pointer"
            >
              <td className="px-2 py-0.5 font-mono text-ink">{shortHash(r.commit_hash)}</td>
              <td className="px-2 py-0.5 font-mono text-ink3">{r.config_hash}</td>
              <td className="px-2 py-0.5 text-ink" title={r.model ?? undefined}>
                {r.model ? modelLabel(r.model) : "—"}
              </td>
              <td className="px-2 py-0.5 text-ink2">{r.device}</td>
              <td className="px-2 py-0.5 font-mono text-ink3">{r.driver_ver}</td>
              <td className="px-2 py-0.5 text-right tabular-nums text-ink2">{r.n}</td>
              <td className="px-2 py-0.5 text-right tabular-nums font-medium text-ink">
                {fmt(r.mean_tps)}
              </td>
              <td className="px-2 py-0.5 text-right tabular-nums text-ink3">{fmt(r.sd_tps)}</td>
              <td className="px-2 py-0.5 text-right tabular-nums text-ink2">{fmt(r.cov_pct, 1)}</td>
              <td className="px-2 py-0.5 text-right tabular-nums font-medium text-ink">
                {fmt(r.prefill_mean, 1)}
              </td>
              <td className="px-2 py-0.5 text-right tabular-nums text-ink3">
                {fmt(r.prefill_sd, 1)}
              </td>
              <td className="px-2 py-0.5">
                {r.n < N_MIN && (
                  <span className="mr-1 px-1 rounded text-[11px] text-ink2 border border-edge">
                    <span style={{ color: STATUS.warning }}>▲</span> n&lt;{N_MIN}
                  </span>
                )}
                {r.cov_pct != null && r.cov_pct > COV_MAX && (
                  <span className="px-1 rounded text-[11px] text-ink2 border border-edge">
                    <span style={{ color: STATUS.serious }}>◆</span> CoV&gt;{COV_MAX}%
                  </span>
                )}
                {(r.quality?.length ?? 0) > 0 && (
                  <span
                    className="ml-1 px-1 rounded text-[11px] text-ink2 border border-edge"
                    title={r.quality.join(" · ")}
                  >
                    <span
                      style={{
                        color: r.quality.some((q) => q.startsWith("reps"))
                          ? STATUS.serious
                          : STATUS.warning,
                      }}
                    >
                      ⚠
                    </span>{" "}
                    {r.quality[0]}
                    {r.quality.length > 1 ? ` +${r.quality.length - 1}` : ""}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
