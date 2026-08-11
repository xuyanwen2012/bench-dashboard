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
  const { filters, meta } = useFilters();
  const [sort, setSort] = useState<Sort>(null);
  // grouped mode answers "why several rows with the same settings": one block
  // per settings combo, its commits listed beneath in first-seen order
  const [grouped, setGrouped] = useState(true);
  const { data, error, loading } = useFetch<ConfigStat[]>(`/api/configs${filterQs(filters)}`);

  if (error) return <p className="text-danger">{error}</p>;
  if (loading) return <p className="text-ink3">loading…</p>;

  // clicking a header cycles: ascending → descending → default (API order)
  const clickCol = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));

  const rows = [...(data ?? [])];
  if (!grouped && sort) {
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

  const totalRuns = rows.reduce((a, r) => a + r.n, 0);
  const flagged = rows.filter((r) => (r.quality?.length ?? 0) > 0).length;

  const commitIdx = new Map((meta?.e2e.commits ?? []).map((c, i) => [c, i]));
  const groups = new Map<string, ConfigStat[]>();
  if (grouped) {
    for (const r of rows) {
      const key = `${r.device}|${r.driver_ver}|${r.model ?? ""}|${r.branch}`;
      const g = groups.get(key);
      if (g) g.push(r);
      else groups.set(key, [r]);
    }
    for (const g of groups.values())
      g.sort((a, b) => (commitIdx.get(a.commit_hash) ?? 0) - (commitIdx.get(b.commit_hash) ?? 0));
  }
  const groupList = [...groups.values()].sort((a, b) => {
    const A = a[0];
    const B = b[0];
    return (
      A.device.localeCompare(B.device) ||
      modelSize(A.model ?? "") - modelSize(B.model ?? "") ||
      A.driver_ver.localeCompare(B.driver_ver) ||
      A.branch.localeCompare(B.branch)
    );
  });

  const SETTINGS_COLS = ["model", "device", "driver"];
  const visibleCols = grouped ? COLS.filter((c) => !SETTINGS_COLS.includes(c.key)) : COLS;

  const row = (r: ConfigStat, inGroup: boolean) => (
    <tr
      key={r.config_hash}
      onClick={() => (location.hash = `#/config/${r.config_hash}${filterQs(filters)}`)}
      className="border-b border-edge-soft hover:bg-raised cursor-pointer"
    >
      <td className="px-2 py-0.5 font-mono text-ink">{shortHash(r.commit_hash)}</td>
      <td className="px-2 py-0.5 font-mono text-ink3">{r.config_hash}</td>
      {/* settings columns exist only flat; grouped, they live in the header row */}
      {!inGroup && (
        <>
          <td className="px-2 py-0.5 text-ink" title={r.model ?? undefined}>
            {r.model ? modelLabel(r.model) : "—"}
          </td>
          <td className="px-2 py-0.5 text-ink2">{r.device}</td>
          <td className="px-2 py-0.5 font-mono text-ink3">{r.driver_ver}</td>
        </>
      )}
      <td className="px-2 py-0.5 text-right tabular-nums text-ink2">{r.n}</td>
      <td className="px-2 py-0.5 text-right tabular-nums font-medium text-ink">
        {fmt(r.mean_tps)}
      </td>
      <td className="px-2 py-0.5 text-right tabular-nums text-ink3">{fmt(r.sd_tps)}</td>
      <td className="px-2 py-0.5 text-right tabular-nums text-ink2">{fmt(r.cov_pct, 1)}</td>
      <td className="px-2 py-0.5 text-right tabular-nums font-medium text-ink">
        {fmt(r.prefill_mean, 1)}
      </td>
      <td className="px-2 py-0.5 text-right tabular-nums text-ink3">{fmt(r.prefill_sd, 1)}</td>
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
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-[12px]">
        <label className="flex items-center gap-1 text-ink2">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
          group by settings
        </label>
        <span className="text-ink3">
          {grouped
            ? "one block per settings combo · commits in first-seen order"
            : "click a column to sort · asc → desc → default"}
        </span>
        <span className="ml-auto text-ink3 tabular-nums">
          {rows.length} configs · {totalRuns} runs ·{" "}
          {flagged > 0 ? (
            <>
              <span style={{ color: STATUS.warning }}>⚠</span> {flagged} flagged
            </>
          ) : (
            "0 flagged"
          )}
        </span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink3 border-b border-edge">
            {visibleCols.map((c) => (
              <th
                key={c.key}
                onClick={grouped ? undefined : () => clickCol(c.key)}
                aria-sort={
                  !grouped && sort?.key === c.key
                    ? sort.dir === 1
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className={`px-2 py-1 select-none ${
                  grouped ? "" : "cursor-pointer hover:text-ink"
                } ${c.right ? "text-right" : ""} ${
                  !grouped && sort?.key === c.key ? "text-ink" : ""
                }`}
              >
                {c.label}
                {!grouped && sort?.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped
            ? groupList.flatMap((g) => {
                const f = g[0];
                return [
                  <tr key={`h:${f.config_hash}`} className="border-b border-edge-soft">
                    <td
                      colSpan={visibleCols.length}
                      className="px-2 pt-3 pb-1 text-[11px] uppercase tracking-wide text-ink2"
                    >
                      {f.model ? modelLabel(f.model) : "—"} · {f.device} ·{" "}
                      <span className="font-mono normal-case">{f.driver_ver}</span> ·{" "}
                      <span className="font-mono normal-case">{f.branch}</span>
                      <span className="text-ink3">
                        {" "}
                        · {g.length} commit{g.length === 1 ? "" : "s"}
                      </span>
                    </td>
                  </tr>,
                  ...g.map((r) => row(r, true)),
                ];
              })
            : rows.map((r) => row(r, false))}
        </tbody>
      </table>
    </div>
  );
}
