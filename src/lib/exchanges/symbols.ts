import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { fetchBitgetSymbols } from "@/lib/exchanges/bitget";
import { fetchFuturesSymbols } from "@/lib/exchanges/binance-futures";
import type { Exchange } from "@/lib/store/chart-store";

/**
 * The set of symbols each exchange actually lists.
 *
 * This matters because the two venues don't overlap: Bitget has HYPEUSDT but
 * Binance doesn't, and Binance's batch ticker endpoint rejects the *entire*
 * request with a 400 if any symbol in it is unknown. So every place that
 * fetches by symbol must filter against these sets first.
 */
const cache: Partial<Record<Exchange, Set<string>>> = {};

export async function fetchSupportedSymbols(
  exchange: Exchange,
): Promise<Set<string>> {
  const cached = cache[exchange];
  if (cached) return cached;

  const symbols =
    exchange === "binance"
      ? (await fetchExchangeSymbols()).map((s) => s.symbol)
      : exchange === "binancef"
        ? await fetchFuturesSymbols()
        : await fetchBitgetSymbols();

  const set = new Set(symbols.map((s) => s.toUpperCase()));
  cache[exchange] = set;
  return set;
}
