import type { Candle, Ticker24h, Timeframe } from "@/lib/binance/types";
import { decimalsFromTickSize, registerPrecision } from "@/lib/precision";
import { fetchJsonFrom } from "@/lib/net";

/**
 * Binance USDT-M perpetual futures (fapi). Same response shapes as spot, so the
 * parsers mirror src/lib/binance/rest.ts — only the host and a couple of query
 * quirks differ (e.g. the 24h ticker endpoint has no `symbols` batch param).
 */
const FAPI = "https://fapi.binance.com/fapi/v1";
/** Direct first; the app's server relay when the browser can't reach fapi. */
const FAPI_BASES = [FAPI, "/api/proxy/binancef/fapi/v1"];
const fapi = <T>(path: string, init?: { timeoutMs?: number; cache?: RequestCache }) =>
  fetchJsonFrom<T>("binance-futures", FAPI_BASES, path, init);

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
  const data = await fapi<unknown[][]>(`/klines?${params}`);
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
  const data = await fapi<Record<string, string>[]>("/ticker/24hr");
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
  const data = await fapi<{ symbols: unknown[] }>("/exchangeInfo", {
    timeoutMs: 20_000,
    cache: "force-cache",
  });
  const live = (data.symbols as {
    symbol: string;
    status: string;
    quoteAsset: string;
    contractType: string;
    filters?: { filterType: string; tickSize?: string }[];
  }[]).filter(
    (s) =>
      s.status === "TRADING" &&
      s.quoteAsset === "USDT" &&
      s.contractType === "PERPETUAL",
  );

  // Register the real tick size so prices render at the venue's own precision
  for (const s of live) {
    const tick = s.filters?.find((f) => f.filterType === "PRICE_FILTER")?.tickSize;
    if (tick) {
      registerPrecision("binancef", s.symbol.toUpperCase(), decimalsFromTickSize(tick));
    }
  }

  return live.map((s) => s.symbol.toUpperCase());
}
