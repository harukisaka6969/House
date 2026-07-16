export class ApiClientError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new ApiClientError((body && (body as { error?: string }).error) || res.statusText, res.status, body);
  }
  return body as T;
}

export function apiPost<T>(url: string, data?: unknown): Promise<T> {
  return apiFetch<T>(url, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined });
}
export function apiGet<T>(url: string): Promise<T> {
  return apiFetch<T>(url);
}
export function apiPut<T>(url: string, data?: unknown): Promise<T> {
  return apiFetch<T>(url, { method: "PUT", body: data !== undefined ? JSON.stringify(data) : undefined });
}
export function apiDelete<T>(url: string): Promise<T> {
  return apiFetch<T>(url, { method: "DELETE" });
}
