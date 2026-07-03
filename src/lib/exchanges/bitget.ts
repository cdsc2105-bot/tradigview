import type { Candle, Ticker24h, Timeframe } from "@/lib/binance/types";

const BITGET_BASE = "https://api.bitget.com/api/v2/mix/market";

/**
 * Map internal timeframe strings to Bitget granularity values.
 * Bitget uses "utc" suffix for >=4H candles to avoid timezone ambiguity.
 */
const GRANULARITY_MAP: Record<Timeframe, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "2h": "2H",
  "4h": "4Hutc",
  "6h": "6Hutc",
  "8h": "8Hutc",
  "12h": "12Hutc",
  "1d": "1Dutc",
  "3d": "3Dutc",
  "1w": "1Wutc",
  "1M": "1Mutc",
};

/**
 * Fetch klines (candlestick data) from Bitget perpetual futures.
 *
 * @param symbol  Trading pair, e.g. "BTCUSDT"
 * @param interval  Timeframe string, e.g. "1m", "5m", "1h", "4h", "1d"
 * @param limit  Number of candles to fetch (default 200, max 200)
 * @returns Array of Candle objects with time in unix seconds
 */
export async function fetchBitgetKlines(
  symbol: string,
  interval: string,
  limit: number = 200
): Promise<Candle[]> {
  const granularity = GRANULARITY_MAP[interval as Timeframe] ?? interval;

  const params = new URLSearchParams({
    symbol,
    productType: "USDT-FUTURES",
    granularity,
    limit: String(Math.min(limit, 200)),
  });

  const res = await fetch(`${BITGET_BASE}/candles?${params}`);
  if (!res.ok) {
    throw new Error(`Bitget klines error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const data: string[][] = json.data ?? [];

  // Response: [timestamp_ms, open, high, low, close, volume_base, volume_quote]
  // Bitget returns newest first — reverse to match chronological order.
  return data
    .map((row) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
    .reverse();
}

/**
 * Fetch 24h ticker for a single Bitget perpetual futures symbol.
 */
export async function fetchBitgetTicker(symbol: string): Promise<Ticker24h> {
  const params = new URLSearchParams({
    symbol,
    productType: "USDT-FUTURES",
  });

  const res = await fetch(`${BITGET_BASE}/ticker?${params}`);
  if (!res.ok) {
    throw new Error(`Bitget ticker error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const data = json.data?.[0] ?? json.data;

  return mapTicker(data);
}

/**
 * Fetch 24h tickers for multiple Bitget perpetual futures symbols.
 * Fetches all USDT-FUTURES tickers and filters to the requested symbols.
 */
export async function fetchBitgetTickers(
  symbols: string[]
): Promise<Ticker24h[]> {
  const params = new URLSearchParams({
    productType: "USDT-FUTURES",
  });

  const res = await fetch(`${BITGET_BASE}/tickers?${params}`);
  if (!res.ok) {
    throw new Error(`Bitget tickers error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const data: unknown[] = json.data ?? [];

  const requested = new Set(symbols.map((s) => s.toUpperCase()));

  return data
    .filter((t: any) => requested.has(String(t.symbol).toUpperCase()))
    .map(mapTicker);
}

/**
 * Map a raw Bitget ticker response object to our Ticker24h interface.
 */
function mapTicker(raw: any): Ticker24h {
  const lastPrice = Number(raw.lastPr ?? raw.last ?? 0);
  const open24h = Number(raw.open24h ?? raw.openUtc ?? 0);
  const priceChange = lastPrice - open24h;
  const priceChangePercent =
    open24h !== 0 ? (priceChange / open24h) * 100 : 0;

  return {
    symbol: String(raw.symbol ?? ""),
    lastPrice,
    priceChange,
    priceChangePercent: Number(
      raw.change24h
        ? Number(raw.change24h) * 100
        : priceChangePercent
    ),
    highPrice: Number(raw.high24h ?? 0),
    lowPrice: Number(raw.low24h ?? 0),
    volume: Number(raw.baseVolume ?? raw.volume24h ?? 0),
    quoteVolume: Number(raw.quoteVolume ?? raw.usdtVolume ?? 0),
  };
}
