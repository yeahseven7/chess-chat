/** Tiny fetch wrapper for client components. Throws Error with server message on !ok. */
export async function api<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}
