import type { Candle } from "@/lib/binance/types";
import { aggregateCandles } from "@/lib/aggregate";

/** Ascending, one bar per timestamp (the later copy of a bar wins). */
export function sortDedupe(candles: Candle[]): Candle[] {
  const sorted = candles
    .filter((c) => isFinite(c.time) && isFinite(c.close))
    .sort((a, b) => a.time - b.time);
  const out: Candle[] = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && last.time === c.time) out[out.length - 1] = c;
    else out.push(c);
  }
  return out;
}

/** Seconds for fixed-length intervals (months are approximated). */
export const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60,
  "2m": 120,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "3h": 10_800,
  "4h": 14_400,
  "6h": 21_600,
  "8h": 28_800,
  "12h": 43_200,
  "1d": 86_400,
  "3d": 259_200,
  "1w": 604_800,
  "1M": 2_592_000,
};

/**
 * Fetch `limit` candles ending at `endTime` from an endpoint that caps each
 * request at `pageSize` rows. The windows are known up front (fixed-length
 * bars), so the pages are requested in parallel rather than one after another.
 */
export async function fetchPaged(
  interval: string,
  limit: number,
  pageSize: number,
  endTime: number | undefined,
  page: (limit: number, endTime: number | undefined) => Promise<Candle[]>,
): Promise<Candle[]> {
  if (limit <= pageSize) return sortDedupe(await page(limit, endTime));
  const step = (INTERVAL_SECONDS[interval] ?? 60) * 1000 * pageSize;
  const end = endTime ?? Date.now();
  const pages = Math.ceil(limit / pageSize);
  const results = await Promise.allSettled(
    Array.from({ length: pages }, (_, i) =>
      page(pageSize, i === 0 && endTime === undefined ? undefined : end - i * step),
    ),
  );
  // The most recent page must succeed; older ones are best-effort.
  if (results[0].status === "rejected") throw results[0].reason;
  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return sortDedupe(all).slice(-limit);
}

/**
 * Build an interval a venue lacks by rolling up a smaller one it has
 * (e.g. 8h from 4h), fetching enough base bars for `limit` results.
 */
export async function fetchRolledUp(
  base: string,
  target: string,
  limit: number,
  endTime: number | undefined,
  fetchBase: (interval: string, limit: number, endTime?: number) => Promise<Candle[]>,
): Promise<Candle[]> {
  const bucket = INTERVAL_SECONDS[target];
  const factor = Math.round(bucket / INTERVAL_SECONDS[base]);
  const raw = await fetchBase(base, limit * factor, endTime);
  return aggregateCandles(raw, bucket).slice(-limit);
}

/** A number from a string/number field, NaN when absent. */
export const num = (v: unknown): number =>
  v === undefined || v === null || v === "" ? NaN : Number(v);

/** Unix seconds from ms, seconds or a date string. */
export function toSeconds(v: unknown): number {
  const n = Number(v);
  if (isFinite(n) && n > 0) return Math.floor(n > 1e11 ? n / 1000 : n);
  if (typeof v === "string") {
    // "2024-01-01 00:00:00" style — treat as UTC
    const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(" ", "T")}Z`);
    if (isFinite(t)) return Math.floor(t / 1000);
  }
  return NaN;
}

/**
 * Parse one candle from any of the usual shapes: an array
 * [time, open, high, low, close, volume] or an object with long or short keys.
 */
export function parseCandle(row: unknown): Candle {
  if (Array.isArray(row)) {
    return {
      time: toSeconds(row[0]),
      open: num(row[1]),
      high: num(row[2]),
      low: num(row[3]),
      close: num(row[4]),
      volume: num(row[5]) || 0,
    };
  }
  const r = (row ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) if (r[k] !== undefined && r[k] !== null) return r[k];
    return undefined;
  };
  return {
    time: toSeconds(pick("time", "ts", "t", "openTime", "id", "timestamp", "date")),
    open: num(pick("open", "o")),
    high: num(pick("high", "h")),
    low: num(pick("low", "l")),
    close: num(pick("close", "c")),
    volume: num(pick("baseVol", "volume", "vol", "v", "amount", "b")) || 0,
  };
}

/** The candle rows of a `{ code, data }` response, wherever they sit. */
export function rowsOf(json: unknown): unknown[] {
  const data = (json as { data?: unknown })?.data ?? json;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["list", "items", "klines", "rows", "data"]) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/** Bitunix wraps every answer as `{ code, msg, data }`; non-zero code = error. */
export function assertOk(json: unknown, what: string) {
  const code = (json as { code?: unknown })?.code;
  if (code !== undefined && Number(code) !== 0 && String(code) !== "00000") {
    const msg = (json as { msg?: unknown })?.msg;
    throw new Error(`${what}: ${code} ${msg ?? ""}`);
  }
}
