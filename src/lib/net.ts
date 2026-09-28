/**
 * Fetch JSON from the first host that answers, with a timeout per attempt.
 *
 * Binance serves the same public market data from several hosts; some
 * networks or regions block one (HTTP 451, DNS failures, hangs) but not the
 * other. The host that worked last is tried first next time, so only the very
 * first request pays for a fallback.
 */
const preferred = new Map<string, number>();

export class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} ${url}`);
  }
}

export async function fetchJsonFrom<T>(
  /** Group name used to remember the working host, e.g. "binance-spot" */
  group: string,
  bases: string[],
  path: string,
  { timeoutMs = 10_000, cache = "no-store" as RequestCache } = {},
): Promise<T> {
  const start = preferred.get(group) ?? 0;
  const order = bases.map((_, i) => (start + i) % bases.length);
  let lastError: unknown = null;

  for (const i of order) {
    const url = `${bases[i]}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { cache, signal: ctrl.signal });
      if (!res.ok) {
        // A bad request is our fault, not the host's — don't try the others.
        if (res.status === 400) throw new HttpError(res.status, url);
        lastError = new HttpError(res.status, url);
        continue;
      }
      const data = (await res.json()) as T;
      preferred.set(group, i);
      return data;
    } catch (e) {
      if (e instanceof HttpError && e.status === 400) throw e;
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`No host answered for ${path}`);
}
