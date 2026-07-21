import type { Candle, SymbolInfo, Ticker24h, Timeframe } from "./types";
import { decimalsFromTickSize, registerPrecision } from "@/lib/precision";

const BASE = "https://api.binance.com/api/v3";

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
  const url = `${BASE}/klines?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const data = (await res.json()) as unknown[][];
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
  const url = `${BASE}/ticker/24hr?symbol=${symbol.toUpperCase()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ticker ${res.status}`);
  const t = await res.json();
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
  const url = `${BASE}/ticker/24hr?symbols=${encodeURIComponent(arr)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`tickers ${res.status}`);
  const data = await res.json();
  return data.map((t: Record<string, string>) => ({
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
  const res = await fetch(`${BASE}/exchangeInfo`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`exchangeInfo ${res.status}`);
  const data = await res.json();
  const live = (data.symbols as RawSymbol[]).filter(
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
