import type { Candle, Ticker24h, Timeframe } from "@/lib/binance/types";

const BITGET_BASE = "https://api.bitget.com/api/v2/mix/market";

/**
 * Map internal timeframe strings to Bitget granularity values.
 * Bitget uses "utc" suffix for >=4H candles to avoid timezone ambiguity.
 */
const GRANULARITY_MAP: Record<Timeframe, string> = {
  "1m": "1m",
  // 2m doesn't exist on any venue — the chart aggregates 1m client-side and
  // never requests it, this entry just keeps the map total.
  "2m": "1m",
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
 * @param limit  Number of candles to fetch (default 1000, max 1000)
 * @param endTime  Unix ms. When set, returns the candles before it — Bitget
 *                 serves those from a separate `history-candles` endpoint.
 * @returns Array of Candle objects with time in unix seconds
 */
export async function fetchBitgetKlines(
  symbol: string,
  interval: string,
  limit: number = 1000,
  endTime?: number
): Promise<Candle[]> {
  const granularity = GRANULARITY_MAP[interval as Timeframe] ?? interval;

  // Recent bars come from `/candles` (up to 1000 in one go). Older ones live
  // behind `/history-candles`, which rejects any request over 200 rows — so walk
  // it backwards in 200-bar pages until we've collected what the caller asked for.
  if (endTime === undefined) {
    return fetchBitgetPage(symbol, granularity, Math.min(limit, 1000));
  }

  const HISTORY_PAGE = 200;
  const collected: Candle[] = [];
  let cursor = Math.floor(endTime);

  while (collected.length < limit) {
    const page = await fetchBitgetPage(
      symbol,
      granularity,
      Math.min(HISTORY_PAGE, limit - collected.length),
      cursor,
    );
    if (page.length === 0) break; // reached the listing date
    collected.unshift(...page);
    cursor = page[0].time * 1000 - 1;
    if (page.length < HISTORY_PAGE) break;
  }

  return collected;
}

/** One Bitget candles request, normalized to ascending, de-duplicated bars. */
async function fetchBitgetPage(
  symbol: string,
  granularity: string,
  limit: number,
  endTime?: number,
): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol,
    productType: "USDT-FUTURES",
    granularity,
    limit: String(limit),
  });
  const endpoint = endTime === undefined ? "candles" : "history-candles";
  if (endTime !== undefined) params.set("endTime", String(endTime));

  const res = await fetch(`${BITGET_BASE}/${endpoint}?${params}`);
  if (!res.ok) {
    throw new Error(`Bitget klines error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const data: string[][] = json.data ?? [];

  // Response rows: [timestamp_ms, open, high, low, close, volume_base, volume_quote].
  // lightweight-charts requires strictly ascending, de-duplicated timestamps, so
  // sort explicitly rather than assuming the API's order (it returns oldest-first,
  // but sorting keeps us safe if that ever changes) and drop any duplicate bars.
  const candles = data.map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));

  candles.sort((a, b) => a.time - b.time);

  const deduped: Candle[] = [];
  for (const c of candles) {
    const last = deduped[deduped.length - 1];
    if (last && last.time === c.time) {
      deduped[deduped.length - 1] = c; // keep the latest version of the bar
    } else {
      deduped.push(c);
    }
  }
  return deduped;
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
  const data = (json.data?.[0] ?? json.data) as Record<string, unknown>;

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
  const data: Record<string, unknown>[] = json.data ?? [];

  const requested = new Set(symbols.map((s) => s.toUpperCase()));

  return data
    .filter((t) => requested.has(String(t.symbol).toUpperCase()))
    .map(mapTicker);
}

/**
 * Every USDT-margined perpetual symbol listed on Bitget.
 * Bitget lists pairs Binance doesn't (e.g. HYPEUSDT), so the watchlist and
 * symbol search need to know what actually exists per exchange.
 */
export async function fetchBitgetSymbols(): Promise<string[]> {
  const params = new URLSearchParams({ productType: "USDT-FUTURES" });

  const res = await fetch(`${BITGET_BASE}/tickers?${params}`);
  if (!res.ok) {
    throw new Error(`Bitget symbols error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const data: { symbol?: string }[] = json.data ?? [];
  return data
    .map((t) => String(t.symbol ?? "").toUpperCase())
    .filter(Boolean);
}

/**
 * Map a raw Bitget ticker response object to our Ticker24h interface.
 */
function mapTicker(raw: Record<string, unknown>): Ticker24h {
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
