/**
 * Decimals the chart's price axis should show for an asset at this price.
 * Without this every symbol renders at 2 decimals, which turns ADA (0.1723)
 * into a useless "0.17 / 0.18" axis.
 */
export function priceFormatFor(price: number): {
  precision: number;
  minMove: number;
} {
  const p = Math.abs(price);
  if (p >= 1) return { precision: 2, minMove: 0.01 };
  if (p >= 0.01) return { precision: 4, minMove: 0.0001 };
  if (p >= 0.0001) return { precision: 6, minMove: 0.000001 };
  return { precision: 8, minMove: 0.00000001 };
}

export function formatPrice(n: number): string {
  if (!isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

export function formatPct(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatVolume(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}
