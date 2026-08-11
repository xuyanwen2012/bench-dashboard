import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import type { Filters, Meta, MetaCat } from "./api";
import { qs } from "./api";
import FilterBar from "./components/FilterBar";
import { useFetch, useHashRoute } from "./hooks";
import { type ChartTokens, DARK, LIGHT } from "./theme";
import Compare from "./views/Compare";
import ConfigRuns from "./views/ConfigRuns";
import Configs from "./views/Configs";
import RunDetail from "./views/RunDetail";
import SweepTrend from "./views/SweepTrend";
import TileSweep from "./views/TileSweep";
import Trend from "./views/Trend";

type FilterCtx = { filters: Filters; setFilters: (f: Filters) => void; meta: Meta | null };
const Ctx = createContext<FilterCtx>({ filters: {}, setFilters: () => {}, meta: null });
export const useFilters = () => useContext(Ctx);

type ThemeCtx = { dark: boolean; toggle: () => void; t: ChartTokens };
const Theme = createContext<ThemeCtx>({ dark: false, toggle: () => {}, t: LIGHT });
export const useTheme = () => useContext(Theme);

// Two benchmark categories, each with its own views. e2e = whole-model runs
// (prefill + decode); tile sweep = kernel microbenchmarks (prefill only).
type Category = "e2e" | "sweep";
const NAV: {
  category: string;
  cat: Category;
  items: { id: string; label: string; hash: string }[];
}[] = [
  {
    category: "e2e",
    cat: "e2e",
    items: [
      { id: "configs", label: "configs", hash: "#/configs" },
      { id: "trend", label: "trend", hash: "#/trend" },
      { id: "compare", label: "compare", hash: "#/compare" },
    ],
  },
  {
    category: "tile sweep",
    cat: "sweep",
    items: [
      { id: "sweep", label: "heatmap", hash: "#/sweep" },
      { id: "sweep-trend", label: "trend", hash: "#/sweep/trend" },
    ],
  },
];

// Shared filters live in the hash query (#/trend?device=…) so every filtered
// view is bookmarkable, like compare's criteria. compare owns its own params
// (its fixed dims reuse these names); run detail has none.
const FILTER_KEYS = ["device", "branch", "driver_ver", "model"] as const;
const filterCatOf = (view: string): Category | null =>
  view === "compare" || view === "run" ? null : view === "sweep" ? "sweep" : "e2e";

// Returns null when the hash shouldn't drive filters: wrong view, or a bare
// link with no query at all (which keeps the in-session selection instead of
// clearing it). A link WITH a query is authoritative, absent keys included.
function filtersFromHash(): { category: Category; filters: Filters } | null {
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  const category = filterCatOf(path.split("/")[0] || "configs");
  if (!category || query == null) return null;
  const p = new URLSearchParams(query);
  const filters: Filters = {};
  for (const k of FILTER_KEYS) {
    const v = p.get(k);
    if (v) filters[k] = v;
  }
  return { category, filters };
}

function App() {
  // per-category filter state: an e2e choice (e.g. model=8B) must not leak into
  // the sweep views, where it can silently filter everything out
  const [allFilters, setAllFilters] = useState<{ e2e: Filters; sweep: Filters }>(() => {
    const fromUrl = filtersFromHash();
    return {
      e2e: {},
      sweep: {},
      ...(fromUrl ? { [fromUrl.category]: fromUrl.filters } : {}),
    };
  });
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");
  const { data: meta } = useFetch<Meta>("/api/meta");
  const route = useHashRoute();

  // navigation (hashchange) re-applies whatever filters the target URL carries
  // biome-ignore lint/correctness/useExhaustiveDependencies: route is the trigger, not an input — the hash is re-parsed on every navigation
  useEffect(() => {
    const fromUrl = filtersFromHash();
    if (fromUrl) setAllFilters((s) => ({ ...s, [fromUrl.category]: fromUrl.filters }));
  }, [route]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const isSweep = route.view === "sweep";
  const category = isSweep ? "sweep" : "e2e";
  const filters = allFilters[category];
  const setFilters = (f: Filters) => {
    setAllFilters((s) => ({ ...s, [category]: f }));
    // mirror into the URL; replaceState so filter tweaks don't pile up history
    if (filterCatOf(route.view)) {
      const path = location.hash.split("?")[0] || "#/configs";
      history.replaceState(null, "", `${path}${filterQs(f)}`);
    }
  };
  const activeId = isSweep
    ? route.arg === "trend"
      ? "sweep-trend"
      : "sweep"
    : route.view === "config" || route.view === "run"
      ? "configs"
      : route.view;
  const barOptions: MetaCat | null = meta ? (isSweep ? meta.sweep : meta.e2e) : null;
  const showFilterBar = ["configs", "trend", "config", "sweep"].includes(route.view);

  return (
    <Ctx.Provider value={{ filters, setFilters, meta }}>
      <Theme.Provider value={{ dark, toggle: () => setDark(!dark), t: dark ? DARK : LIGHT }}>
        <div className="min-h-screen bg-page flex flex-col">
          <header className="flex items-center gap-1 px-3 py-1.5 border-b border-edge">
            <span aria-hidden className="mr-1.5 h-2.5 w-1 bg-series" />
            <span className="font-mono text-ink text-[12px]">
              bench<span className="text-ink3">-dashboard</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDark(!dark)}
              className="ml-auto h-6 px-2 text-[12px] text-ink2"
            >
              {dark ? "light" : "dark"}
            </Button>
          </header>
          <div className="flex flex-1 min-h-0">
            <aside className="w-40 shrink-0 border-r border-edge px-2 py-3">
              {NAV.map((group) => (
                <div key={group.category} className="mb-4">
                  <div className="px-2 mb-1 text-[11px] uppercase tracking-wide text-ink3">
                    {group.category}
                  </div>
                  {group.items.map((item) => (
                    <a
                      key={item.id}
                      href={
                        item.id === "compare"
                          ? item.hash
                          : item.hash + filterQs(allFilters[group.cat])
                      }
                      className={`block px-2 py-1 rounded-r text-[12px] border-l-2 ${
                        activeId === item.id
                          ? "border-series bg-raised text-ink"
                          : "border-transparent text-ink2 hover:text-ink hover:border-edge"
                      }`}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              ))}
            </aside>
            <div className="flex-1 min-w-0">
              {showFilterBar && (
                <FilterBar options={barOptions} filters={filters} onChange={setFilters} />
              )}
              <main className="p-3">
                {route.view === "configs" && <Configs />}
                {route.view === "config" && route.arg && <ConfigRuns configHash={route.arg} />}
                {route.view === "trend" && <Trend />}
                {route.view === "compare" && <Compare />}
                {route.view === "run" && route.arg && <RunDetail id={route.arg} />}
                {isSweep && (route.arg === "trend" ? <SweepTrend /> : <TileSweep />)}
              </main>
            </div>
          </div>
        </div>
      </Theme.Provider>
    </Ctx.Provider>
  );
}

export function filterQs(
  filters: Filters,
  extra: Record<string, string | number | boolean | undefined> = {},
) {
  return qs({ ...filters, ...extra });
}

// apply persisted theme before first paint
if (localStorage.getItem("theme") === "dark") document.documentElement.classList.add("dark");

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");
const queryClient = new QueryClient();
createRoot(rootEl).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
