import type { Candle } from "@/lib/binance/types";

/** Seconds per 2-minute bucket. */
const BUCKET = 120;

const bucketOf = (time: number) => Math.floor(time / BUCKET) * BUCKET;

/**
 * Roll 1m candles up into 2m buckets. No venue offers a native 2m interval —
 * TradingView builds it the same way, by aggregating 1m data.
 */
export function aggregate2m(oneMinute: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (const c of oneMinute) {
    const bucket = bucketOf(c.time);
    const last = out[out.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else {
      out.push({ ...c, time: bucket });
    }
  }
  return out;
}

/**
 * Live version: wraps an `onCandle` handler so 1m WebSocket updates come out
 * as the evolving 2m candle.
 *
 * The tricky case is subscribing mid-bucket: the first minute never arrives
 * over the socket, so its OHLC is taken from `seedFor(bucket)` — the candle
 * the REST load already has for that bucket.
 */
export function makeTwoMinuteAggregator(
  onCandle: (c: Candle) => void,
  seedFor: (bucketTime: number) => Candle | undefined,
): (oneMin: Candle) => void {
  let bucket = -1;
  let first: Candle | null = null;
  let second: Candle | null = null;
  let seed: Candle | null = null;

  return (k: Candle) => {
    const b = bucketOf(k.time);
    if (b !== bucket) {
      bucket = b;
      first = null;
      second = null;
      seed = null;
    }

    if (k.time === b) first = k;
    else second = k;

    if (!first && !seed) {
      // Joined during the second minute — reuse what REST loaded for this bucket.
      seed = seedFor(b) ?? null;
    }

    const parts = [first ?? seed, second].filter((x): x is Candle => x !== null);
    if (parts.length === 0) return;

    onCandle({
      time: b,
      open: parts[0].open,
      high: Math.max(...parts.map((p) => p.high)),
      low: Math.min(...parts.map((p) => p.low)),
      close: parts[parts.length - 1].close,
      volume: parts.reduce((s, p) => s + p.volume, 0),
      isFinal: second?.isFinal === true,
    });
  };
}
