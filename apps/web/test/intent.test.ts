import { beforeEach, describe, expect, test } from "bun:test";
import {
  rememberIntent,
  takeIntent,
  type PendingIntent,
} from "@/modules/auth/lib/pending-intent";

// A minimal sessionStorage for bun's test runtime.
const store = new Map<string, string>();
globalThis.sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const save = (at: number): PendingIntent => ({
  kind: "save",
  path: "/shop",
  productId: "p1",
  name: "Tee",
  at,
});

describe("pending intent", () => {
  beforeEach(() => store.clear());

  test("runs once, on the page it was made on", () => {
    rememberIntent(save(1_000));
    expect(takeIntent("/products/tee", 2_000)).toBeNull(); // another page: kept
    expect(takeIntent("/shop", 2_000)).toMatchObject({ productId: "p1" });
    expect(takeIntent("/shop", 2_000)).toBeNull(); // taken
  });

  test("drops an abandoned one", () => {
    rememberIntent(save(0));
    expect(takeIntent("/shop", 31 * 60 * 1000)).toBeNull();
    expect(store.size).toBe(0);
  });

  test("ignores junk", () => {
    store.set("cs-pending-intent", "{not json");
    expect(takeIntent("/shop")).toBeNull();
  });
});
