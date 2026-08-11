import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { getJson } from "./api";

// Same { data, error, loading } shape as the original hand-rolled hook, now backed
// by TanStack Query so revisiting a URL renders from cache and refetches silently.
export function useFetch<T>(url: string | null) {
  const { data, error, isPending } = useQuery<T>({
    queryKey: [url],
    queryFn: () => getJson<T>(url as string),
    enabled: url != null,
    staleTime: 5_000,
  });
  return {
    data: data ?? null,
    error: error ? String(error.message ?? error) : null,
    loading: url != null && isPending && !error,
  };
}

export function useHashRoute() {
  const parse = useCallback(() => {
    // "#/compare?metric=..." — the query part belongs to the view, not the route
    const h = location.hash.replace(/^#\/?/, "").split("?")[0];
    const [view, arg] = h.split("/");
    return { view: view || "configs", arg: arg ?? null };
  }, []);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [parse]);
  return route;
}
