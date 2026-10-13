import { beforeEach, expect, mock, test } from "bun:test";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

// Fake API: requests 401 until a refresh succeeds.
let sessionValid = false;
let refreshCalls = 0;
let refreshStatus = 200;
let refreshFixesSession = true;

mock.module("@repo/api-client", () => ({
  refreshSession: async () => {
    refreshCalls++;
    await Bun.sleep(20);
    if (refreshStatus !== 200) {
      const config = { headers: {} } as InternalAxiosRequestConfig;
      throw new AxiosError("refresh failed", "ERR_BAD_REQUEST", config, null, {
        status: refreshStatus,
        statusText: "",
        headers: {},
        config,
        data: {},
      });
    }
    sessionValid = refreshFixesSession;
  },
}));

const assign = mock((url: string) => void url);
const location = {
  origin: "http://localhost:3000",
  pathname: "/account",
  search: "?tab=1",
  assign,
};
(globalThis as { window?: unknown }).window = { location };

const { attachRefreshInterceptor } =
  await import("@/lib/axios/refresh-interceptor");
const { onSessionExpired } = await import("@/lib/auth/events");

function makeApi() {
  const calls: string[] = [];
  const api = axios.create({
    adapter: async (config) => {
      calls.push(config.url ?? "");
      const status = sessionValid ? 200 : 401;
      const response = {
        status,
        statusText: "",
        headers: {},
        config,
        data: { url: config.url },
      };
      if (status === 401) {
        throw new AxiosError("401", "ERR_BAD_REQUEST", config, null, response);
      }
      return response;
    },
  });
  attachRefreshInterceptor(api);
  return { api, calls };
}

beforeEach(() => {
  sessionValid = false;
  refreshCalls = 0;
  refreshStatus = 200;
  refreshFixesSession = true;
  assign.mockClear();
});

test("concurrent 401s share one refresh and are all retried", async () => {
  const { api, calls } = makeApi();
  const urls = [1, 2, 3, 4, 5].map((i) => `http://api/api/v1/carts?i=${i}`);

  const results = await Promise.all(urls.map((u) => api.get(u)));

  expect(refreshCalls).toBe(1);
  expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
  expect(calls.length).toBe(10); // each request: one 401, one retry
});

test("a request is retried only once", async () => {
  // The refresh succeeds, but the API keeps answering 401.
  refreshFixesSession = false;
  const { api, calls } = makeApi();

  await expect(api.get("http://api/api/v1/auth/me")).rejects.toThrow();

  expect(refreshCalls).toBe(1);
  expect(calls.length).toBe(2);
});

test("auth endpoints never trigger a refresh", async () => {
  const { api } = makeApi();
  for (const path of ["login", "register", "refresh", "logout"]) {
    await expect(
      api.post(`http://api/api/v1/auth/${path}`),
    ).rejects.toBeInstanceOf(AxiosError);
  }
  expect(refreshCalls).toBe(0);
});

test("only an exact path match skips the refresh", async () => {
  const { api } = makeApi();
  await api.get("http://api/api/v1/products?q=/api/v1/auth/login");
  expect(refreshCalls).toBe(1);
});

test("a 401 refresh expires the session and redirects from a protected page", async () => {
  refreshStatus = 401;
  const expired = mock(() => {});
  const off = onSessionExpired(expired);
  const { api } = makeApi();

  const results = await Promise.allSettled([
    api.get("http://api/api/v1/auth/me"),
    api.get("http://api/api/v1/carts"),
  ]);

  off();
  expect(results.every((r) => r.status === "rejected")).toBe(true);
  expect(refreshCalls).toBe(1);
  expect(expired).toHaveBeenCalledTimes(1);
  expect(assign).toHaveBeenCalledWith("/auth/login?next=%2Faccount%3Ftab%3D1");
});

test("a 5xx refresh keeps the session and does not redirect", async () => {
  refreshStatus = 503;
  const expired = mock(() => {});
  const off = onSessionExpired(expired);
  const { api } = makeApi();

  await expect(api.get("http://api/api/v1/auth/me")).rejects.toThrow();

  off();
  expect(expired).not.toHaveBeenCalled();
  expect(assign).not.toHaveBeenCalled();
});
