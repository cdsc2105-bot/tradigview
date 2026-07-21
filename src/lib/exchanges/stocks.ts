import type { Candle, Ticker24h, Timeframe } from "@/lib/binance/types";

/**
 * Stocks & indices, served through our own /api/stocks proxy (Yahoo Finance
 * can't be called from the browser directly). Unlike the crypto venues there's
 * no WebSocket, so the chart and watchlist poll.
 */

/** Indices first, then the mega-caps — the tickers people actually watch. */
export const STOCK_SYMBOLS = [
  "^GSPC", // S&P 500
  "^IXIC", // Nasdaq Composite
  "^DJI", // Dow Jones
  "SPY", // S&P 500 ETF
  "QQQ", // Nasdaq 100 ETF
  "NVDA",
  "AAPL",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AMD",
  "NFLX",
  "COIN",
  "MSTR",
];

/** Pretty names for the axis/legend — "^GSPC" means nothing to most people. */
export const STOCK_LABELS: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "Nasdaq",
  "^DJI": "Dow Jones",
};

export function stockLabel(symbol: string): string {
  return STOCK_LABELS[symbol] ?? symbol;
}

export async function fetchStockKlines(
  symbol: string,
  interval: Timeframe,
  _limit = 1000,
  _endTime?: number,
): Promise<Candle[]> {
  const params = new URLSearchParams({ symbol, interval });
  const res = await fetch(`/api/stocks/klines?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`stock klines ${res.status}`);
  const data = (await res.json()) as Candle[];
  return Array.isArray(data) ? data : [];
}

export async function fetchStockTickers(symbols: string[]): Promise<Ticker24h[]> {
  if (symbols.length === 0) return [];
  const params = new URLSearchParams({ symbols: symbols.join(",") });
  const res = await fetch(`/api/stocks/quotes?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`stock quotes ${res.status}`);
  const data = (await res.json()) as Ticker24h[];
  return Array.isArray(data) ? data : [];
}
