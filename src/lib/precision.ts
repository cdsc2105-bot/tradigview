import type { Exchange } from "@/lib/store/chart-store";

/**
 * How many decimals to show for each symbol.
 *
 * TradingView derives this from the venue's tick size — BTC trades in 0.01
 * steps (2 decimals) while NEAR trades in 0.001 (3) and ADA in 0.0001 (4).
 * Guessing from price magnitude alone gets 1.93 wrong (it isn't a 2-decimal
 * asset), so exchanges register their real tick size here as symbols load and
 * we only fall back to magnitude when a venue hasn't reported one.
 */
const registry: Partial<Record<Exchange, Map<string, number>>> = {};

/** Decimals implied by a tick size string like "0.00100000" → 3. */
export function decimalsFromTickSize(tick: string | number): number {
  const n = typeof tick === "number" ? tick : parseFloat(tick);
  if (!isFinite(n) || n <= 0) return 2;
  // 0.001 → 3. Round to kill float noise like 2.9999999
  const d = Math.round(-Math.log10(n));
  return Math.max(0, Math.min(8, d));
}

export function registerPrecision(
  exchange: Exchange,
  symbol: string,
  decimals: number,
) {
  let map = registry[exchange];
  if (!map) {
    map = new Map();
    registry[exchange] = map;
  }
  map.set(symbol.toUpperCase(), decimals);
}

/** Magnitude fallback for venues that never reported a tick size. */
export function precisionFromPrice(price: number): number {
  const p = Math.abs(price);
  if (p >= 1000) return 2;
  if (p >= 100) return 3;
  if (p >= 1) return 4;
  if (p >= 0.01) return 5;
  if (p >= 0.0001) return 6;
  return 8;
}

/**
 * Decimals for a symbol — its real tick size when the venue reported one,
 * otherwise inferred from the price.
 */
export function precisionFor(
  exchange: Exchange,
  symbol: string,
  price: number,
): number {
  const known = registry[exchange]?.get(symbol.toUpperCase());
  if (known !== undefined) return known;
  return precisionFromPrice(price);
}

/** Format a price with the symbol's own precision, grouped with thousands. */
export function formatPriceFor(
  exchange: Exchange,
  symbol: string,
  price: number,
): string {
  if (!isFinite(price)) return "—";
  const d = precisionFor(exchange, symbol, price);
  return price.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
