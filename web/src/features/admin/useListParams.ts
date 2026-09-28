import { useDeferredValue } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * List filters kept in the URL (shareable, survive reloads). Changing any filter
 * resets to page 1. Search text is deferred so typing stays responsive.
 */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ""])) as Record<K | "q", string>;
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const deferredQ = useDeferredValue(q.trim());

  function update(next: Partial<Record<K | "q" | "page", string | number | undefined>>) {
    const search = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") search.delete(key);
      else search.set(key, String(value));
    }
    if (!("page" in next)) search.delete("page");
    setParams(search, { replace: true });
  }

  return { values, q, deferredQ, page, update };
}
