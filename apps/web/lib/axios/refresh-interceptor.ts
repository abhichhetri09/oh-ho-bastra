import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { refreshSession } from "@repo/api-client";
import { emitSessionExpired } from "@/lib/auth/events";
import { loginPath } from "@/lib/auth/redirect";
import { isProtectedPath } from "@/lib/proxy/config";
import {
  getIsRefreshing,
  setIsRefreshing,
  settleQueue,
  waitForRefresh,
} from "./refresh-queue";

// A 401 from these means bad credentials or no session, never an expired
// access token, so they must not trigger a refresh (the refresh call itself
// would loop).
const NO_REFRESH_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
]);

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function pathOf(url: string | undefined): string {
  try {
    return new URL(url ?? "", window.location.origin).pathname;
  } catch {
    return "";
  }
}

/**
 * On a 401, refreshes the session once (the refresh token is an HTTP-only
 * cookie) and retries the request. Concurrent 401s share one refresh.
 */
export function attachRefreshInterceptor(api: AxiosInstance): void {
  api.interceptors.response.use(undefined, async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined;

    if (
      !original ||
      error.response?.status !== 401 ||
      original._retry ||
      NO_REFRESH_PATHS.has(pathOf(original.url))
    ) {
      return Promise.reject(error);
    }

    // Retry at most once, also for requests that waited on another refresh.
    original._retry = true;

    if (getIsRefreshing()) {
      await waitForRefresh();
      return api(original);
    }

    setIsRefreshing(true);
    try {
      await refreshSession({ throwOnError: true });
      settleQueue(null);
    } catch (refreshError) {
      settleQueue(refreshError);

      // Only a 401 means the session is gone; a network error or 5xx may
      // be temporary, so keep the user signed in.
      if (
        axios.isAxiosError(refreshError) &&
        refreshError.response?.status === 401
      ) {
        emitSessionExpired();
        const { pathname, search } = window.location;
        if (isProtectedPath(pathname)) {
          window.location.assign(loginPath(pathname + search));
        }
      }
      return Promise.reject(refreshError);
    } finally {
      setIsRefreshing(false);
    }

    return api(original);
  });
}
