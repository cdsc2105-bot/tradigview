import type { Candle, Ticker24h, Timeframe } from "@/lib/binance/types";

/**
 * Binance USDT-M perpetual futures (fapi). Same response shapes as spot, so the
 * parsers mirror src/lib/binance/rest.ts — only the host and a couple of query
 * quirks differ (e.g. the 24h ticker endpoint has no `symbols` batch param).
 */
const FAPI = "https://fapi.binance.com/fapi/v1";

/**
 * @param endTime  Unix ms. When set, returns the `limit` candles that closed
 *                 before it — used to page further back into history.
 */
export async function fetchFuturesKlines(
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
  const res = await fetch(`${FAPI}/klines?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`futures klines ${res.status}`);
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

/**
 * 24h tickers for the requested symbols. fapi's ticker endpoint can't take a
 * symbol batch, so fetch them all (~400 rows) and filter — same as Bitget.
 */
export async function fetchFuturesTickers(
  symbols: string[],
): Promise<Ticker24h[]> {
  const res = await fetch(`${FAPI}/ticker/24hr`, { cache: "no-store" });
  if (!res.ok) throw new Error(`futures tickers ${res.status}`);
  const data = (await res.json()) as Record<string, string>[];
  const requested = new Set(symbols.map((s) => s.toUpperCase()));
  return data
    .filter((t) => requested.has(t.symbol))
    .map((t) => ({
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

/** Every live USDT-margined perpetual on Binance Futures. */
export async function fetchFuturesSymbols(): Promise<string[]> {
  const res = await fetch(`${FAPI}/exchangeInfo`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`futures exchangeInfo ${res.status}`);
  const data = await res.json();
  return (data.symbols as {
    symbol: string;
    status: string;
    quoteAsset: string;
    contractType: string;
  }[])
    .filter(
      (s) =>
        s.status === "TRADING" &&
        s.quoteAsset === "USDT" &&
        s.contractType === "PERPETUAL",
    )
    .map((s) => s.symbol.toUpperCase());
}
