import type { Candle, Ticker24h } from "@/lib/binance/types";
import { registerPrecision } from "@/lib/precision";
import { fetchJsonFrom } from "@/lib/net";
import { fetchPaged, fetchRolledUp, parseCandle, rowsOf, sortDedupe } from "./candles";

/**
 * Bitget spot market (v2). Same host and relay as the futures module, but its
 * own paths, granularity names and ticker fields.
 */
const BASES = ["https://api.bitget.com/api/v2/spot", "/api/proxy/bitget/api/v2/spot"];
const spot = <T>(path: string, init?: { timeoutMs?: number }) =>
  fetchJsonFrom<T>("bitget-spot", BASES, path, init);

/** Bitget spot granularities; missing ones are rolled up from a smaller one. */
const GRANULARITY: Record<string, string> = {
  "1m": "1min",
  "3m": "3min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "1h": "1h",
  "4h": "4h",
  "6h": "6Hutc",
  "12h": "12Hutc",
  "1d": "1Dutc",
  "3d": "3Dutc",
  "1w": "1Wutc",
  "1M": "1Mutc",
};
const ROLL_UP: Record<string, string> = { "2m": "1m", "2h": "1h", "3h": "1h", "8h": "4h" };

/** Recent bars come from `/candles` (≤1000), older from `/history-candles` (≤200 each). */
async function fetchRaw(symbol: string, interval: string, limit: number, endTime?: number): Promise<Candle[]> {
  const granularity = GRANULARITY[interval];
  const page = async (endpoint: string, n: number, end?: number) => {
    const params = new URLSearchParams({ symbol, granularity, limit: String(n) });
    if (end !== undefined) params.set("endTime", String(Math.floor(end)));
    const json = await spot<unknown>(`/market/${endpoint}?${params}`);
    return rowsOf(json).map(parseCandle);
  };

  if (endTime === undefined) {
    const recent = sortDedupe(await page("candles", Math.min(limit, 1000)));
    if (limit <= 1000 || recent.length === 0) return recent;
    const older = await fetchRaw(symbol, interval, limit - recent.length, recent[0].time * 1000 - 1);
    return sortDedupe([...older, ...recent]);
  }
  return fetchPaged(interval, limit, 200, endTime, (n, end) => page("history-candles", n, end));
}

export async function fetchBitgetSpotKlines(
  symbol: string,
  interval: string,
  limit = 1000,
  endTime?: number,
): Promise<Candle[]> {
  const base = ROLL_UP[interval];
  if (base) {
    return fetchRolledUp(base, interval, limit, endTime, (i, l, e) => fetchRaw(symbol, i, l, e));
  }
  return fetchRaw(symbol, interval, limit, endTime);
}

function mapTicker(raw: Record<string, unknown>): Ticker24h {
  const lastPrice = Number(raw.lastPr ?? 0);
  const open = Number(raw.open ?? raw.openUtc ?? 0);
  const change = raw.change24h !== undefined ? Number(raw.change24h) * 100 : open ? ((lastPrice - open) / open) * 100 : 0;
  return {
    symbol: String(raw.symbol ?? "").toUpperCase(),
    lastPrice,
    priceChange: lastPrice - open,
    priceChangePercent: change,
    highPrice: Number(raw.high24h ?? 0),
    lowPrice: Number(raw.low24h ?? 0),
    volume: Number(raw.baseVolume ?? 0),
    quoteVolume: Number(raw.quoteVolume ?? raw.usdtVolume ?? 0),
  };
}

/** 24h tickers: one symbol by query, many by the full list (~1 request). */
export async function fetchBitgetSpotTickers(symbols: string[]): Promise<Ticker24h[]> {
  if (symbols.length === 0) return [];
  const query = symbols.length === 1 ? `?symbol=${encodeURIComponent(symbols[0])}` : "";
  const json = await spot<{ data?: Record<string, unknown>[] }>(`/market/tickers${query}`);
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));
  return (json.data ?? []).map(mapTicker).filter((t) => wanted.has(t.symbol));
}

/** USDT spot pairs trading on Bitget, registering each one's price decimals. */
export async function fetchBitgetSpotSymbols(): Promise<string[]> {
  const json = await spot<{
    data?: { symbol?: string; quoteCoin?: string; status?: string; pricePrecision?: string }[];
  }>("/public/symbols", { timeoutMs: 20_000 });
  const out: string[] = [];
  for (const s of json.data ?? []) {
    const symbol = String(s.symbol ?? "").toUpperCase();
    if (!symbol || s.quoteCoin !== "USDT" || (s.status && s.status !== "online")) continue;
    out.push(symbol);
    const places = Number(s.pricePrecision);
    if (isFinite(places)) registerPrecision("bitgetspot", symbol, Math.max(0, Math.min(8, places)));
  }
  return out;
}
