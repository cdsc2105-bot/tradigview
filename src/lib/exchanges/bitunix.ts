import type { Candle, Ticker24h } from "@/lib/binance/types";
import { registerPrecision } from "@/lib/precision";
import { fetchJsonFrom } from "@/lib/net";
import { assertOk, fetchPaged, fetchRolledUp, num, parseCandle, rowsOf } from "./candles";

/**
 * Bitunix public market data — USDT-M perpetual futures (fapi.bitunix.com)
 * and spot (openapi.bitunix.com). Every answer is wrapped as
 * `{ code, msg, data }`. There's no browser-friendly stream here, so the
 * chart and watchlist poll (the chart's watchdog already does every ~2.5s).
 */
const FUT_BASES = [
  "https://fapi.bitunix.com/api/v1/futures/market",
  "/api/proxy/bitunixf/api/v1/futures/market",
];
const SPOT_BASES = ["https://openapi.bitunix.com/api/spot/v1", "/api/proxy/bitunix/api/spot/v1"];

async function futures<T>(path: string, timeoutMs?: number): Promise<T> {
  const json = await fetchJsonFrom<T>("bitunix-futures", FUT_BASES, path, { timeoutMs });
  assertOk(json, "bitunix futures");
  return json;
}
async function spot<T>(path: string, timeoutMs?: number): Promise<T> {
  const json = await fetchJsonFrom<T>("bitunix-spot", SPOT_BASES, path, { timeoutMs });
  assertOk(json, "bitunix spot");
  return json;
}

// ——— Futures ———

/** Futures intervals match ours; the endpoint caps a request at 200 bars. */
const FUT_INTERVALS = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"]);
const ROLL_UP: Record<string, string> = { "2m": "1m", "3h": "1h" };

async function futuresRaw(symbol: string, interval: string, limit: number, endTime?: number) {
  return fetchPaged(interval, limit, 200, endTime, async (n, end) => {
    const params = new URLSearchParams({ symbol, interval, limit: String(n) });
    if (end !== undefined) params.set("endTime", String(Math.floor(end)));
    return rowsOf(await futures<unknown>(`/kline?${params}`)).map(parseCandle);
  });
}

export async function fetchBitunixFuturesKlines(
  symbol: string,
  interval: string,
  limit = 1000,
  endTime?: number,
): Promise<Candle[]> {
  if (!FUT_INTERVALS.has(interval) && ROLL_UP[interval]) {
    return fetchRolledUp(ROLL_UP[interval], interval, limit, endTime, (i, l, e) => futuresRaw(symbol, i, l, e));
  }
  return futuresRaw(symbol, interval, limit, endTime);
}

function mapFuturesTicker(t: Record<string, unknown>): Ticker24h {
  const lastPrice = num(t.lastPrice ?? t.last);
  const open = num(t.open);
  return {
    symbol: String(t.symbol ?? "").toUpperCase(),
    lastPrice,
    priceChange: lastPrice - open,
    priceChangePercent: open ? ((lastPrice - open) / open) * 100 : 0,
    highPrice: num(t.high) || 0,
    lowPrice: num(t.low) || 0,
    volume: num(t.baseVol) || 0,
    quoteVolume: num(t.quoteVol) || 0,
  };
}

export async function fetchBitunixFuturesTickers(symbols: string[]): Promise<Ticker24h[]> {
  if (symbols.length === 0) return [];
  const query = symbols.length <= 20 ? `?symbols=${symbols.join(",")}` : "";
  const json = await futures<{ data?: Record<string, unknown>[] }>(`/tickers${query}`);
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));
  return (json.data ?? []).map(mapFuturesTicker).filter((t) => wanted.has(t.symbol) && isFinite(t.lastPrice));
}

export async function fetchBitunixFuturesSymbols(): Promise<string[]> {
  const json = await futures<{
    data?: { symbol?: string; quote?: string; quotePrecision?: number | string; symbolStatus?: string }[];
  }>("/trading_pairs", 20_000);
  const out: string[] = [];
  for (const p of json.data ?? []) {
    const symbol = String(p.symbol ?? "").toUpperCase();
    if (!symbol || (p.quote && p.quote.toUpperCase() !== "USDT")) continue;
    if (p.symbolStatus && p.symbolStatus.toUpperCase() !== "OPEN") continue;
    out.push(symbol);
    const places = Number(p.quotePrecision);
    if (isFinite(places)) registerPrecision("bitunixf", symbol, Math.max(0, Math.min(8, places)));
  }
  return out;
}

// ——— Spot ———

/** Spot intervals are minutes or D/W/M; the endpoint caps a request at 500 bars. */
const SPOT_INTERVAL: Record<string, string> = {
  "1m": "1",
  "3m": "3",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "6h": "360",
  "12h": "720",
  "1d": "D",
  "1w": "W",
  "1M": "M",
};
const SPOT_ROLL_UP: Record<string, string> = { "2m": "1m", "3h": "1h", "8h": "4h", "3d": "1d" };

async function spotRaw(symbol: string, interval: string, limit: number, endTime?: number) {
  return fetchPaged(interval, limit, 500, endTime, async (n, end) => {
    const params = new URLSearchParams({
      symbol,
      interval: SPOT_INTERVAL[interval],
      limit: String(n),
      endTime: String(Math.floor(end ?? Date.now())),
    });
    return rowsOf(await spot<unknown>(`/market/kline/history?${params}`)).map(parseCandle);
  });
}

export async function fetchBitunixSpotKlines(
  symbol: string,
  interval: string,
  limit = 1000,
  endTime?: number,
): Promise<Candle[]> {
  const base = SPOT_ROLL_UP[interval];
  if (base) return fetchRolledUp(base, interval, limit, endTime, (i, l, e) => spotRaw(symbol, i, l, e));
  return spotRaw(symbol, interval, limit, endTime);
}

/**
 * Spot has no batch 24h ticker, so each symbol's price and change come from
 * its current daily candle (change since the UTC day open).
 */
export async function fetchBitunixSpotTickers(symbols: string[]): Promise<Ticker24h[]> {
  const results = await Promise.allSettled(
    symbols.map(async (symbol): Promise<Ticker24h> => {
      const bars = await spotRaw(symbol, "1d", 1);
      const d = bars[bars.length - 1];
      if (!d) throw new Error(`no data ${symbol}`);
      return {
        symbol,
        lastPrice: d.close,
        priceChange: d.close - d.open,
        priceChangePercent: d.open ? ((d.close - d.open) / d.open) * 100 : 0,
        highPrice: d.high,
        lowPrice: d.low,
        volume: d.volume,
        quoteVolume: 0,
      };
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

export async function fetchBitunixSpotSymbols(): Promise<string[]> {
  const json = await spot<unknown>("/common/coin_pair/list", 20_000);
  const out: string[] = [];
  for (const raw of rowsOf(json)) {
    const p = raw as Record<string, unknown>;
    const base = String(p.base ?? p.baseCoin ?? "").toUpperCase();
    const quote = String(p.quote ?? p.quoteCoin ?? "").toUpperCase();
    const symbol = String(p.symbol ?? `${base}${quote}`).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!symbol || (quote && quote !== "USDT") || (!quote && !symbol.endsWith("USDT"))) continue;
    const open = p.isOpen ?? p.open ?? p.status;
    if (open !== undefined && !(open === true || open === 1 || open === "1" || /^(true|open|online|trading)$/i.test(String(open)))) continue;
    out.push(symbol);
    const places = Number(p.quotePrecision ?? p.pricePrecision);
    if (isFinite(places)) registerPrecision("bitunix", symbol, Math.max(0, Math.min(8, places)));
  }
  return out;
}
