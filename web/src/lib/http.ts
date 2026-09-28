export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export class NotFoundError extends ApiError {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message =
      typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    throw res.status === 404
      ? new NotFoundError(404, message, body)
      : new ApiError(res.status, message, body);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export function getJson<T>(path: string) {
  return request<T>(path);
}

export function postJson<T>(path: string, body: unknown) {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function patchJson<T>(path: string, body: unknown) {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function putJson<T>(path: string, body: unknown) {
  return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteJson<T = void>(path: string) {
  return request<T>(path, { method: "DELETE" });
}

export const retryUnlessClientError = (count: number, error: Error) =>
  !(error instanceof ApiError && error.status < 500) && count < 2;
