'use client';

export class ApiClientError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// --- Silent refresh machinery (Fix 1) ---
// When an access token expires (15 min), the first 401 triggers a single
// POST /api/auth/refresh call. If it succeeds (the httpOnly refresh-token
// cookie is sent automatically), the original request is retried once.
// Concurrent 401s while a refresh is already in-flight wait for the same
// promise rather than firing multiple refresh calls.
let refreshPromise: Promise<boolean> | null = null;

async function attemptSilentRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** Paths where a 401 should NOT trigger a silent refresh attempt. */
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login', '/auth/register'];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  // On 401, attempt a silent token refresh and retry once -- unless the
  // failing request is itself the refresh/login call (which would loop).
  if (res.status === 401 && !NO_REFRESH_PATHS.some((p) => path.startsWith(p))) {
    const refreshed = await attemptSilentRefresh();
    if (refreshed) {
      const retry = await fetch(`/api${path}`, {
        ...init,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      });
      if (retry.ok) {
        if (retry.status === 204) return undefined as T;
        return retry.json();
      }
      // Retry also failed -- fall through to the error below using the
      // retry response so the caller gets the real second-attempt status.
      const body = await retry.json().catch(() => ({ error: retry.statusText }));
      throw new ApiClientError(retry.status, body.error ?? 'Request failed');
    }
    // Refresh itself failed -- session is dead, throw the original 401.
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiClientError(res.status, body.error ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

const DEVICE_ID_KEY = 'pulse_device_id';

/** Stable per-browser device id used for the per-device checkpoint (Tier 1 item 6). */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device-${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
