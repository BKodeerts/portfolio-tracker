/** Base fetch wrapper. Throws on non-2xx or malformed JSON. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

interface ApiOk<T> { status: 'ok'; data: T }
interface ApiErr   { status: 'error'; message: string }
type ApiResponse<T> = ApiOk<T> | ApiErr;

/** Unwraps { status, data } envelopes used by most endpoints. */
export async function apiGet<T>(path: string): Promise<T> {
  const body = await apiFetch<ApiResponse<T>>(path);
  if (body.status !== 'ok') throw new Error((body as ApiErr).message);
  return (body as ApiOk<T>).data;
}

/** POST helper with JSON body. */
export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
