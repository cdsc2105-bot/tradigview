import type { Candle } from "@/lib/binance/types";

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

/**
 * Simple Moving Average
 */
export function sma(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

/**
 * Exponential Moving Average — seeded with SMA of first `period` candles.
 */
export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += candles[i].close;
  prev /= period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

/**
 * RSI (Wilder) — period typically 14.
 */
export function rsi(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  let rs = loss === 0 ? 100 : gain / loss;
  out.push({ time: candles[period].time, value: 100 - 100 / (1 + rs) });
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    rs = loss === 0 ? 100 : gain / loss;
    out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
  }
  return out;
}

/**
 * MACD — fast EMA, slow EMA, signal EMA of the MACD line.
 * Defaults: 12 / 26 / 9.
 */
export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signal = 9,
): MACDPoint[] {
  if (candles.length < slow + signal) return [];
  const emaFast = ema(candles, fast);
  const emaSlow = ema(candles, slow);
  // align: emaSlow starts later
  const slowStartTime = emaSlow[0].time;
  const fastByTime = new Map(emaFast.map((p) => [p.time, p.value]));
  const macdLine: IndicatorPoint[] = [];
  for (const p of emaSlow) {
    const f = fastByTime.get(p.time);
    if (f !== undefined) macdLine.push({ time: p.time, value: f - p.value });
  }
  // signal = EMA of MACD line. Build synthetic candles for ema()
  const synth: Candle[] = macdLine.map((p) => ({
    time: p.time,
    open: p.value,
    high: p.value,
    low: p.value,
    close: p.value,
    volume: 0,
  }));
  const sig = ema(synth, signal);
  const sigByTime = new Map(sig.map((p) => [p.time, p.value]));
  const out: MACDPoint[] = [];
  for (const p of macdLine) {
    const s = sigByTime.get(p.time);
    if (s === undefined) continue;
    out.push({ time: p.time, macd: p.value, signal: s, histogram: p.value - s });
  }
  void slowStartTime;
  return out;
}

export interface BollingerPoint {
  time: number;
  upper: number;
  middle: number;
  lower: number;
}

export function bollingerBands(
  candles: Candle[],
  period = 20,
  stdDev = 2,
): BollingerPoint[] {
  const out: BollingerPoint[] = [];
  if (candles.length < period) return out;
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    const mean = sum / period;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++)
      sqSum += (candles[j].close - mean) ** 2;
    const sd = Math.sqrt(sqSum / period);
    out.push({
      time: candles[i].time,
      upper: mean + stdDev * sd,
      middle: mean,
      lower: mean - stdDev * sd,
    });
  }
  return out;
}

export interface StochPoint {
  time: number;
  k: number;
  d: number;
}

export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3,
  smooth = 3,
): StochPoint[] {
  if (candles.length < kPeriod) return [];
  const rawK: IndicatorPoint[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    const val = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
    rawK.push({ time: candles[i].time, value: val });
  }
  const smoothedK = smoothSMA(rawK, smooth);
  const dLine = smoothSMA(smoothedK, dPeriod);
  const dByTime = new Map(dLine.map((p) => [p.time, p.value]));
  const out: StochPoint[] = [];
  for (const p of smoothedK) {
    const d = dByTime.get(p.time);
    if (d !== undefined) out.push({ time: p.time, k: p.value, d });
  }
  return out;
}

function smoothSMA(
  data: IndicatorPoint[],
  period: number,
): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (data.length < period) return out;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i].value;
    if (i >= period) sum -= data[i - period].value;
    if (i >= period - 1) out.push({ time: data[i].time, value: sum / period });
  }
  return out;
}

export interface SuperTrendPoint {
  time: number;
  value: number;
  direction: 1 | -1; // 1 = bullish (below price), -1 = bearish (above price)
}

export function superTrend(
  candles: Candle[],
  period = 10,
  multiplier = 3,
): SuperTrendPoint[] {
  if (candles.length < period + 1) return [];
  const atrVals: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      atrVals.push(candles[i].high - candles[i].low);
      continue;
    }
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    atrVals.push(tr);
  }

  const atr: number[] = new Array(candles.length).fill(0);
  let atrSum = 0;
  for (let i = 0; i < period; i++) atrSum += atrVals[i];
  atr[period - 1] = atrSum / period;
  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + atrVals[i]) / period;
  }

  const out: SuperTrendPoint[] = [];
  let prevUpperBand = 0;
  let prevLowerBand = 0;
  let prevST = 0;
  let prevDir: 1 | -1 = 1;

  for (let i = period - 1; i < candles.length; i++) {
    const hl2 = (candles[i].high + candles[i].low) / 2;
    let upperBand = hl2 + multiplier * atr[i];
    let lowerBand = hl2 - multiplier * atr[i];

    if (i > period - 1) {
      upperBand =
        upperBand < prevUpperBand || candles[i - 1].close > prevUpperBand
          ? upperBand
          : prevUpperBand;
      lowerBand =
        lowerBand > prevLowerBand || candles[i - 1].close < prevLowerBand
          ? lowerBand
          : prevLowerBand;
    }

    let dir: 1 | -1;
    let st: number;
    if (i === period - 1) {
      dir = candles[i].close > upperBand ? 1 : -1;
      st = dir === 1 ? lowerBand : upperBand;
    } else {
      if (prevST === prevUpperBand) {
        dir = candles[i].close > upperBand ? 1 : -1;
      } else {
        dir = candles[i].close < lowerBand ? -1 : 1;
      }
      st = dir === 1 ? lowerBand : upperBand;
    }

    prevUpperBand = upperBand;
    prevLowerBand = lowerBand;
    prevST = st;
    prevDir = dir;
    out.push({ time: candles[i].time, value: st, direction: dir });
  }
  void prevDir;
  return out;
}

// ---------------------------------------------------------------------------
// VWAP — Volume Weighted Average Price with standard-deviation bands
// ---------------------------------------------------------------------------

export interface VWAPPoint {
  time: number;
  vwap: number;
  /** Volume-weighted standard deviation at this point (bands = vwap ± k·sd) */
  sd: number;
}

/**
 * VWAP plus the volume-weighted standard deviation, so callers can draw any
 * number of deviation bands (vwap ± k·sd). Resets at the start of each UTC day.
 */
export function vwap(candles: Candle[]): VWAPPoint[] {
  const out: VWAPPoint[] = [];
  if (candles.length === 0) return out;

  let cumVol = 0;
  let cumTP = 0; // cumulative(tp * vol)
  let cumTP2 = 0; // cumulative(tp² * vol)
  let currentDay = -1;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const day = Math.floor(c.time / 86_400); // UTC day index (time is in seconds)

    // Reset accumulators on new day
    if (day !== currentDay) {
      cumVol = 0;
      cumTP = 0;
      cumTP2 = 0;
      currentDay = day;
    }

    const tp = (c.high + c.low + c.close) / 3;
    cumVol += c.volume;
    cumTP += tp * c.volume;
    cumTP2 += tp * tp * c.volume;

    if (cumVol === 0) {
      out.push({ time: c.time, vwap: tp, sd: 0 });
      continue;
    }

    const vwapVal = cumTP / cumVol;
    // Variance = E[tp²] - E[tp]²  (volume-weighted)
    const variance = cumTP2 / cumVol - vwapVal * vwapVal;
    const sd = Math.sqrt(Math.max(0, variance));

    out.push({ time: c.time, vwap: vwapVal, sd });
  }
  return out;
}

// ---------------------------------------------------------------------------
// WaveTrend (Cipher) oscillator
// ---------------------------------------------------------------------------

export interface WaveTrendPoint {
  time: number;
  wt1: number;
  wt2: number;
}

/**
 * WaveTrend oscillator.
 *
 * channelLen = 9, avgLen = 12, signalLen = 3 (defaults).
 *
 * Steps:
 *  1. hlc3 = (H + L + C) / 3
 *  2. esa  = EMA(hlc3, channelLen)
 *  3. d    = EMA(|hlc3 − esa|, channelLen)
 *  4. ci   = (hlc3 − esa) / (0.015 * d)
 *  5. wt1  = EMA(ci, avgLen)
 *  6. wt2  = SMA(wt1, signalLen)
 */
export function waveTrend(
  candles: Candle[],
  channelLen = 9,
  avgLen = 12,
  signalLen = 3,
): WaveTrendPoint[] {
  const n = candles.length;
  if (n === 0) return [];

  // --- helper: EMA over a number[] (seeded with SMA of first `period` values) ---
  function emaArr(src: number[], period: number): number[] {
    const result: number[] = new Array(src.length).fill(NaN);
    if (src.length < period) return result;
    const k = 2 / (period + 1);
    let prev = 0;
    for (let i = 0; i < period; i++) prev += src[i];
    prev /= period;
    result[period - 1] = prev;
    for (let i = period; i < src.length; i++) {
      prev = src[i] * k + prev * (1 - k);
      result[i] = prev;
    }
    return result;
  }

  // 1. hlc3
  const hlc3: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    hlc3[i] = (candles[i].high + candles[i].low + candles[i].close) / 3;
  }

  // 2. esa = EMA(hlc3, channelLen)
  const esa = emaArr(hlc3, channelLen);

  // 3. d = EMA(|hlc3 - esa|, channelLen)
  const absDiff: number[] = new Array(n).fill(0);
  for (let i = channelLen - 1; i < n; i++) {
    absDiff[i] = Math.abs(hlc3[i] - esa[i]);
  }
  const d = emaArr(absDiff, channelLen);

  // 4. ci = (hlc3 - esa) / (0.015 * d)
  const ci: number[] = new Array(n).fill(0);
  // ci is valid from index (2 * channelLen - 2) onward (both esa and d valid)
  const ciStart = 2 * (channelLen - 1);
  for (let i = ciStart; i < n; i++) {
    const dVal = d[i];
    ci[i] = dVal === 0 ? 0 : (hlc3[i] - esa[i]) / (0.015 * dVal);
  }

  // 5. wt1 = EMA(ci, avgLen)
  //    We need to feed emaArr only the valid portion of ci, then map back.
  const ciSlice = ci.slice(ciStart);
  const wt1Slice = emaArr(ciSlice, avgLen);
  // wt1Slice is valid from index (avgLen - 1); absolute index = ciStart + avgLen - 1
  const wt1Start = ciStart + avgLen - 1;

  // 6. wt2 = SMA(wt1, signalLen) — over the valid wt1 values
  //    Collect valid wt1 values first
  const wt1Valid: number[] = [];
  for (let i = avgLen - 1; i < wt1Slice.length; i++) {
    wt1Valid.push(wt1Slice[i]);
  }
  // SMA inline
  const wt2Valid: number[] = new Array(wt1Valid.length).fill(NaN);
  if (wt1Valid.length >= signalLen) {
    let sum = 0;
    for (let i = 0; i < wt1Valid.length; i++) {
      sum += wt1Valid[i];
      if (i >= signalLen) sum -= wt1Valid[i - signalLen];
      if (i >= signalLen - 1) wt2Valid[i] = sum / signalLen;
    }
  }

  // Build output — both wt1 and wt2 must be valid
  const out: WaveTrendPoint[] = [];
  const wt2AbsStart = wt1Start + signalLen - 1;
  for (let i = 0; i < wt1Valid.length; i++) {
    const absIdx = wt1Start + i;
    const w2 = wt2Valid[i];
    if (absIdx < wt2AbsStart || isNaN(w2)) continue;
    out.push({
      time: candles[absIdx].time,
      wt1: wt1Valid[i],
      wt2: w2,
    });
  }

  return out;
}
