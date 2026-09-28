import type { Candle, SymbolInfo, Ticker24h, Timeframe } from "./types";
import { decimalsFromTickSize, registerPrecision } from "@/lib/precision";
import { fetchJsonFrom, HttpError } from "@/lib/net";

/**
 * Binance spot public market data. `data-api.binance.vision` is Binance's own
 * market-data-only mirror, and `/api/proxy` is this app's server relay — the
 * last resort for networks and countries where the browser can't reach
 * Binance at all.
 */
const BASES = [
  "https://api.binance.com/api/v3",
  "https://data-api.binance.vision/api/v3",
  "/api/proxy/binance/api/v3",
];
const spot = <T>(path: string, init?: { timeoutMs?: number; cache?: RequestCache }) =>
  fetchJsonFrom<T>("binance-spot", BASES, path, init);

/**
 * @param endTime  Unix ms. When set, returns the `limit` candles that closed
 *                 before it — used to page further back into history.
 */
export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  limit = 1000,
  endTime?: number,
): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    interval,
    limit: String(limit),
  });
  if (endTime !== undefined) params.set("endTime", String(Math.floor(endTime)));
  const data = await spot<unknown[][]>(`/klines?${params}`);
  return data.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    isFinal: true,
  }));
}

export async function fetchTicker24h(symbol: string): Promise<Ticker24h> {
  const t = await spot<Record<string, string>>(`/ticker/24hr?symbol=${symbol.toUpperCase()}`);
  return {
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  };
}

export async function fetchTickers24h(symbols: string[]): Promise<Ticker24h[]> {
  const arr = JSON.stringify(symbols.map((s) => s.toUpperCase()));
  const data = await spot<Record<string, string>[]>(
    `/ticker/24hr?symbols=${encodeURIComponent(arr)}`,
  );
  return data.map((t) => ({
    symbol: t.symbol,
    lastPrice: parseFloat(t.lastPrice),
    priceChange: parseFloat(t.priceChange),
    priceChangePercent: parseFloat(t.priceChangePercent),
    highPrice: parseFloat(t.highPrice),
    lowPrice: parseFloat(t.lowPrice),
    volume: parseFloat(t.volume),
    quoteVolume: parseFloat(t.quoteVolume),
  }));
}

interface RawSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  filters?: { filterType: string; tickSize?: string }[];
}

let cachedSymbols: SymbolInfo[] | null = null;
export async function fetchExchangeSymbols(): Promise<SymbolInfo[]> {
  if (cachedSymbols) return cachedSymbols;
  // The full exchangeInfo is many MB, almost all of it permission sets. Ask
  // for the trading pairs without them (a fraction of the size); fall back to
  // the plain call if a host doesn't know the parameters.
  const opts = { timeoutMs: 20_000, cache: "force-cache" as RequestCache };
  const data = await spot<{ symbols: RawSymbol[] }>(
    "/exchangeInfo?symbolStatus=TRADING&showPermissionSets=false",
    opts,
  ).catch((e) => {
    if (e instanceof HttpError && e.status === 400) {
      return spot<{ symbols: RawSymbol[] }>("/exchangeInfo", opts);
    }
    throw e;
  });
  const live = data.symbols.filter(
    (s) => s.status === "TRADING" && s.quoteAsset === "USDT",
  );

  // Record each pair's real tick size so the chart axis and watchlist show the
  // same decimals the exchange quotes in (NEAR 0.001 → 3, ADA 0.0001 → 4).
  for (const s of live) {
    const tick = s.filters?.find((f) => f.filterType === "PRICE_FILTER")?.tickSize;
    if (tick) registerPrecision("binance", s.symbol, decimalsFromTickSize(tick));
  }

  cachedSymbols = live.map((s) => ({
    symbol: s.symbol,
    baseAsset: s.baseAsset,
    quoteAsset: s.quoteAsset,
    status: s.status,
  }));
  return cachedSymbols!;
}
