import { DIMENSIONS, METRICS, makeQueries, openDb } from "./db";
import index from "./index.html";

const { db, path } = openDb();
const q = makeQueries(db);

const json = (data: unknown, status = 200) => Response.json(data, { status });

const filtersOf = (url: URL) => ({
  device: url.searchParams.get("device") ?? undefined,
  branch: url.searchParams.get("branch") ?? undefined,
  driver_ver: url.searchParams.get("driver_ver") ?? undefined,
  commit: url.searchParams.get("commit") ?? undefined,
  model: url.searchParams.get("model") ?? undefined,
});
const inclExcluded = (url: URL) => url.searchParams.get("include_excluded") === "1";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT) || 5173,
  routes: {
    "/api/meta": (_req) => json(q.meta()),

    "/api/configs": (req) => {
      const url = new URL(req.url);
      return json(q.configs(filtersOf(url), inclExcluded(url)));
    },

    "/api/runs": (req) => {
      const url = new URL(req.url);
      const configHash = url.searchParams.get("config_hash");
      if (!configHash) return json({ error: "config_hash is required" }, 400);
      return json(q.runs(configHash, inclExcluded(url)));
    },

    "/api/run/:id": (req) => {
      const id = Number(req.params.id);
      const row = Number.isInteger(id) ? q.run(id) : null;
      return row ? json(row) : json({ error: `no run with id ${req.params.id}` }, 404);
    },

    "/api/trend": (req) => {
      const url = new URL(req.url);
      return json(q.trend(filtersOf(url), inclExcluded(url)));
    },

    "/api/tilesweep": (req) => {
      const url = new URL(req.url);
      return json(q.tilesweep(filtersOf(url), inclExcluded(url)));
    },

    "/api/sweeptrend": (req) => {
      const url = new URL(req.url);
      return json(q.sweeptrend(filtersOf(url), inclExcluded(url)));
    },

    "/api/compare": (req) => {
      const url = new URL(req.url);
      const metric = url.searchParams.get("metric");
      const x = url.searchParams.get("x");
      const series = url.searchParams.get("series");
      if (!metric || !METRICS[metric])
        return json({ error: `metric must be one of: ${Object.keys(METRICS).join(", ")}` }, 400);
      if (!x || !DIMENSIONS[x])
        return json({ error: `x must be one of: ${Object.keys(DIMENSIONS).join(", ")}` }, 400);
      if (series && !DIMENSIONS[series])
        return json({ error: `series must be one of: ${Object.keys(DIMENSIONS).join(", ")}` }, 400);
      if (series && series === x) return json({ error: "series must differ from x" }, 400);
      // a fixed filter on the x/series dimension would contradict the axes
      const filters = filtersOf(url);
      for (const dim of [x, series]) {
        if (dim && dim !== "commit" && filters[dim as keyof typeof filters]) {
          delete filters[dim as keyof typeof filters];
        }
      }
      return json(q.compare(metric, x, series, filters, inclExcluded(url)));
    },

    "/*": index,
  },
});

console.log(`dashboard: http://${server.hostname}:${server.port}/  (db: ${path}, read-only)`);
