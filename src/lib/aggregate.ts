import type { Candle, Timeframe } from "@/lib/binance/types";

/**
 * Timeframes no venue serves natively, built client-side by rolling up a
 * smaller interval: 2m from 1m, 3h from 1h. Buckets are aligned to the Unix
 * epoch, which lines 3h up with 00:00/03:00/06:00… UTC like the exchanges do.
 */
export const SYNTHETIC_TIMEFRAMES: Partial<
  Record<Timeframe, { base: Timeframe; baseSeconds: number; bucketSeconds: number }>
> = {
  "2m": { base: "1m", baseSeconds: 60, bucketSeconds: 120 },
  "3h": { base: "1h", baseSeconds: 3600, bucketSeconds: 10_800 },
};

const bucketOf = (time: number, size: number) => Math.floor(time / size) * size;

/** Merge candles (in time order) into one OHLCV bar stamped at `time`. */
function combine(time: number, parts: Candle[], isFinal: boolean): Candle {
  return {
    time,
    open: parts[0].open,
    high: Math.max(...parts.map((p) => p.high)),
    low: Math.min(...parts.map((p) => p.low)),
    close: parts[parts.length - 1].close,
    volume: parts.reduce((s, p) => s + p.volume, 0),
    isFinal,
  };
}

/**
 * Roll base candles up into fixed-size buckets.
 *
 * A leading bucket whose first base candle is missing is dropped: when paging
 * back with `endTime` the next page ends before that bucket's start, so a
 * partial first bar would otherwise stay wrong forever.
 */
export function aggregateCandles(base: Candle[], bucketSeconds: number): Candle[] {
  const out: Candle[] = [];
  for (const c of base) {
    const bucket = bucketOf(c.time, bucketSeconds);
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
  if (base.length > 0 && base[0].time % bucketSeconds !== 0) out.shift();
  return out;
}

/**
 * Live version: wraps an `onCandle` handler so base-interval WebSocket updates
 * come out as the evolving synthetic candle.
 *
 * Subscribing mid-bucket means the earlier base candles never arrive over the
 * socket, so `seedFor(bucket)` supplies the ones the REST load already has.
 * Parts are keyed by their own open time, so a live update simply replaces
 * the REST snapshot of the same base candle — nothing is counted twice.
 */
export function makeBucketAggregator(
  bucketSeconds: number,
  baseSeconds: number,
  onCandle: (c: Candle) => void,
  seedFor: (bucketTime: number) => Candle[],
): (base: Candle) => void {
  let bucket = -1;
  const parts = new Map<number, Candle>();

  return (k: Candle) => {
    const b = bucketOf(k.time, bucketSeconds);
    if (b !== bucket) {
      bucket = b;
      parts.clear();
      for (const c of seedFor(b)) parts.set(c.time, c);
    }
    parts.set(k.time, k);

    const ordered = [...parts.values()].sort((x, y) => x.time - y.time);
    const lastPartTime = b + bucketSeconds - baseSeconds;
    onCandle(combine(b, ordered, k.time === lastPartTime && k.isFinal === true));
  };
}
