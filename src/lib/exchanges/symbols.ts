import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { fetchBitgetSymbols } from "@/lib/exchanges/bitget";
import { fetchFuturesSymbols } from "@/lib/exchanges/binance-futures";
import { STOCK_SYMBOLS } from "@/lib/exchanges/stocks";
import type { Exchange } from "@/lib/store/chart-store";

/**
 * The set of symbols each exchange actually lists.
 *
 * This matters because the two venues don't overlap: Bitget has HYPEUSDT but
 * Binance doesn't, and Binance's batch ticker endpoint rejects the *entire*
 * request with a 400 if any symbol in it is unknown. So every place that
 * fetches by symbol must filter against these sets first.
 */
const cache: Partial<Record<Exchange, Promise<Set<string>>>> = {};

/**
 * One request per venue, shared by every caller (search dialog, watchlist,
 * market switch). A failure is not cached, so the next call retries.
 */
export function fetchSupportedSymbols(exchange: Exchange): Promise<Set<string>> {
  const cached = cache[exchange];
  if (cached) return cached;

  const load = async () => {
    const symbols =
      exchange === "binance"
        ? (await fetchExchangeSymbols()).map((s) => s.symbol)
        : exchange === "binancef"
          ? await fetchFuturesSymbols()
          : exchange === "stocks"
            ? STOCK_SYMBOLS
            : await fetchBitgetSymbols();
    return new Set(symbols.map((s) => s.toUpperCase()));
  };

  const pending = load().catch((e) => {
    delete cache[exchange];
    throw e;
  });
  cache[exchange] = pending;
  return pending;
}
