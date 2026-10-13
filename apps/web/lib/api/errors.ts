import axios from "axios";
import { ApiErrorSchema, type ApiError } from "@repo/types";

/** The API's error body, if err is an API error response. */
export function getApiError(err: unknown): ApiError | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  const parsed = ApiErrorSchema.safeParse(err.response?.data);
  return parsed.success ? parsed.data : undefined;
}

/** Field errors keyed by path ("email", "images.1"), first message wins. */
export function mapFieldErrors(
  errors: ReadonlyArray<{ field?: string; message: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { field, message } of errors ?? []) {
    if (field && !(field in out)) out[field] = message;
  }
  return out;
}

/**
 * Whether a failed query is worth retrying: network trouble and 5xx may pass,
 * a 4xx answer (not found, invalid, forbidden) will only repeat itself.
 */
export function shouldRetry(failureCount: number, err: unknown): boolean {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined;
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 3;
}
