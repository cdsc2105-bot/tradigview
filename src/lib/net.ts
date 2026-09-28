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
  { timeoutMs = 10_000, cache = "no-store" as RequestCache, hedgeMs = 1_500 } = {},
): Promise<T> {
  const start = preferred.get(group) ?? 0;
  const order = bases.map((_, i) => (start + i) % bases.length);
  const controllers: AbortController[] = [];
  let settled = false;

  /** One attempt against one host; rejects on HTTP error, timeout or abort. */
  const attempt = async (i: number): Promise<{ data: T; i: number }> => {
    const url = `${bases[i]}${path}`;
    const ctrl = new AbortController();
    controllers.push(ctrl);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { cache, signal: ctrl.signal });
      if (!res.ok) throw new HttpError(res.status, url);
      return { data: (await res.json()) as T, i };
    } finally {
      clearTimeout(timer);
    }
  };

  // Hedged requests: start with the preferred host; if it hasn't answered
  // within `hedgeMs` (or fails), also ask the next one. First success wins and
  // the rest are cancelled — a blocked or slow host costs ~1.5s, not a timeout.
  return new Promise<T>((resolve, reject) => {
    let pending = 0;
    let next = 0;
    let lastError: unknown = null;
    let hedgeTimer: ReturnType<typeof setTimeout> | null = null;

    const launch = () => {
      if (settled || next >= order.length) return;
      const i = order[next++];
      pending++;
      if (next < order.length) hedgeTimer = setTimeout(launch, hedgeMs);
      attempt(i).then(
        ({ data, i: won }) => {
          if (settled) return;
          settled = true;
          if (hedgeTimer) clearTimeout(hedgeTimer);
          preferred.set(group, won);
          controllers.forEach((c) => c.abort());
          resolve(data);
        },
        (e) => {
          pending--;
          lastError = e;
          if (settled) return;
          // A bad request is our fault, not the host's — no point asking others.
          if (e instanceof HttpError && e.status === 400 && pending === 0) {
            settled = true;
            reject(e);
            return;
          }
          if (next < order.length) {
            if (hedgeTimer) clearTimeout(hedgeTimer);
            launch();
          } else if (pending === 0) {
            settled = true;
            reject(lastError ?? new Error(`No host answered for ${path}`));
          }
        },
      );
    };
    launch();
  });
}
