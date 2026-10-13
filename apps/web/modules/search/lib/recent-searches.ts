// The shopper's last few searches, kept in localStorage for this browser
// only. Storage can be missing or throw (private mode, blocked site data),
// so every access is guarded and the list then simply stays in memory.

const KEY = "ohhobastra:recent-searches";
export const MAX_RECENT = 5;
const EMPTY: readonly string[] = [];

/** Puts `q` first, drops a case-insensitive duplicate and caps the list. */
export function addRecent(list: readonly string[], q: string): string[] {
  const lower = q.toLowerCase();
  return [q, ...list.filter((item) => item.toLowerCase() !== lower)].slice(
    0,
    MAX_RECENT,
  );
}

let cache: readonly string[] | null = null;
const listeners = new Set<() => void>();

function load(): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string")
          .slice(0, MAX_RECENT)
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(next: readonly string[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not persisted; the in-memory list still works for this visit.
  }
  listeners.forEach((listener) => listener());
}

// useSyncExternalStore plumbing: a stable snapshot until the list changes.
export const recentSearches = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): readonly string[] {
    cache ??= load();
    return cache;
  },
  getServerSnapshot(): readonly string[] {
    return EMPTY;
  },
  add(q: string) {
    save(addRecent(recentSearches.getSnapshot(), q));
  },
  clear() {
    save(EMPTY);
  },
};
