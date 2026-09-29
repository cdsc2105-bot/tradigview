import type { Ticker24h } from "@/lib/binance/types";
import { fetchSpotPrice, fetchTickers24h } from "@/lib/binance/rest";
import { fetchFuturesPrice, fetchFuturesTickers } from "@/lib/exchanges/binance-futures";
import { fetchBitgetTicker, fetchBitgetTickers } from "@/lib/exchanges/bitget";
import { fetchBitgetSpotTickers } from "@/lib/exchanges/bitget-spot";
import {
  fetchBitunixFuturesTickers,
  fetchBitunixSpotPrice,
  fetchBitunixSpotTickers,
} from "@/lib/exchanges/bitunix";
import { STOCK_SYMBOLS, fetchStockTickers } from "@/lib/exchanges/stocks";
import type { Exchange } from "@/lib/store/chart-store";

/** 24h tickers for listed symbols, per venue. */
export const TICKER_FETCHERS: Record<Exchange, (symbols: string[]) => Promise<Ticker24h[]>> = {
  binance: fetchTickers24h,
  binancef: fetchFuturesTickers,
  bitgetspot: fetchBitgetSpotTickers,
  bitget: fetchBitgetTickers,
  bitunix: fetchBitunixSpotTickers,
  bitunixf: fetchBitunixFuturesTickers,
  stocks: fetchStockTickers,
};

/** Stocks (not indices) that crypto venues may list as USDT pairs. */
const TRADABLE_STOCKS = STOCK_SYMBOLS.filter((s) => !s.startsWith("^"));

/**
 * How a stock can be named on a crypto venue: a USDT perpetual on the ticker
 * itself (NVDAUSDT) or a tokenized share (xStocks "NVDAX", Ondo "NVDAON").
 */
export function venueCandidates(stock: string): string[] {
  return [`${stock}USDT`, `${stock}XUSDT`, `${stock}ONUSDT`];
}

/**
 * The stock a chart symbol represents: the symbol itself on the stock market,
 * or the share behind a crypto venue's stock pair (NVDAUSDT → NVDA).
 */
export function stockOf(exchange: Exchange, symbol: string): string | null {
  if (exchange === "stocks") return symbol;
  for (const stock of TRADABLE_STOCKS) {
    if (venueCandidates(stock).includes(symbol)) return stock;
  }
  return null;
}

/** The pair for `stock` on a venue, if that venue lists one. */
export function venueSymbolFor(stock: string, listed: Set<string>): string | null {
  return venueCandidates(stock).find((s) => listed.has(s)) ?? null;
}

/**
 * Last price of one symbol, using each venue's single-pair endpoint (a few
 * hundred bytes) rather than its full ticker list.
 */
const PRICE_FETCHERS: Record<Exchange, (symbol: string) => Promise<number | undefined>> = {
  binance: fetchSpotPrice,
  binancef: fetchFuturesPrice,
  bitgetspot: async (s) => (await fetchBitgetSpotTickers([s]))[0]?.lastPrice,
  bitget: async (s) => (await fetchBitgetTicker(s)).lastPrice,
  bitunix: fetchBitunixSpotPrice,
  bitunixf: async (s) => (await fetchBitunixFuturesTickers([s]))[0]?.lastPrice,
  stocks: async (s) => (await fetchStockTickers([s]))[0]?.lastPrice,
};

/** Last price of one symbol on one venue (null when it has none). */
export async function fetchLastPrice(exchange: Exchange, symbol: string): Promise<number | null> {
  const p = await PRICE_FETCHERS[exchange](symbol);
  return p !== undefined && isFinite(p) && p > 0 ? p : null;
}
