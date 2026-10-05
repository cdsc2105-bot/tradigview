import type { Candle } from "@/lib/binance/types";
import type { IndicatorPoint } from "./index";

/** Every moving-average type the chart offers, as TradingView names them. */
export type MaType = "SMA" | "EMA" | "WMA" | "RMA" | "HMA" | "VWMA";

export const MA_TYPES: { value: MaType; label: string }[] = [
  { value: "SMA", label: "SMA — simple" },
  { value: "EMA", label: "EMA — exponencial" },
  { value: "WMA", label: "WMA — ponderada" },
  { value: "RMA", label: "RMA — Wilder" },
  { value: "HMA", label: "HMA — Hull" },
  { value: "VWMA", label: "VWMA — por volumen" },
];

/** Timeframe a moving average is computed on ("chart" = the chart's own). */
export type MaTimeframe = "chart" | "1h" | "4h" | "1d" | "1w" | "1M";

export const MA_TIMEFRAMES: { value: MaTimeframe; label: string }[] = [
  { value: "chart", label: "Gráfico" },
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1S" },
  { value: "1M", label: "1M" },
];

export const isMaType = (v: unknown): v is MaType => MA_TYPES.some((t) => t.value === v);
export const isMaTimeframe = (v: unknown): v is MaTimeframe =>
  MA_TIMEFRAMES.some((t) => t.value === v);

type Values = (number | null)[];

function smaOf(v: number[], n: number): Values {
  const out: Values = new Array(v.length).fill(null);
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= n) sum -= v[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Exponential average with smoothing `alpha`, seeded with the SMA of the first n. */
function expOf(v: number[], n: number, alpha: number): Values {
  const out: Values = new Array(v.length).fill(null);
  if (v.length < n) return out;
  let prev = 0;
  for (let i = 0; i < n; i++) prev += v[i];
  prev /= n;
  out[n - 1] = prev;
  for (let i = n; i < v.length; i++) {
    prev = v[i] * alpha + prev * (1 - alpha);
    out[i] = prev;
  }
  return out;
}

/** Linearly weighted, newest bar heaviest. Skips windows that contain a gap. */
function wmaOf(v: Values, n: number): Values {
  const out: Values = new Array(v.length).fill(null);
  const weight = (n * (n + 1)) / 2;
  for (let i = n - 1; i < v.length; i++) {
    let s = 0;
    let ok = true;
    for (let k = 0; k < n; k++) {
      const x = v[i - k];
      if (x === null) {
        ok = false;
        break;
      }
      s += x * (n - k);
    }
    if (ok) out[i] = s / weight;
  }
  return out;
}

/** Hull: WMA(2·WMA(n/2) − WMA(n), √n) — fast and smooth. */
function hmaOf(v: number[], n: number): Values {
  const half = wmaOf(v, Math.max(1, Math.floor(n / 2)));
  const full = wmaOf(v, n);
  const diff: Values = v.map((_, i) => {
    const a = half[i];
    const b = full[i];
    return a === null || b === null ? null : 2 * a - b;
  });
  return wmaOf(diff, Math.max(1, Math.round(Math.sqrt(n))));
}

function vwmaOf(close: number[], volume: number[], n: number): Values {
  const out: Values = new Array(close.length).fill(null);
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < close.length; i++) {
    pv += close[i] * volume[i];
    vol += volume[i];
    if (i >= n) {
      pv -= close[i - n] * volume[i - n];
      vol -= volume[i - n];
    }
    if (i >= n - 1) out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}

function averageOf(type: MaType, close: number[], volume: number[], n: number): Values {
  switch (type) {
    case "SMA":
      return smaOf(close, n);
    case "EMA":
      return expOf(close, n, 2 / (n + 1));
    case "RMA":
      return expOf(close, n, 1 / n);
    case "WMA":
      return wmaOf(close, n);
    case "HMA":
      return hmaOf(close, n);
    case "VWMA":
      return vwmaOf(close, volume, n);
  }
}

const TF_SECONDS: Record<Exclude<MaTimeframe, "chart" | "1M">, number> = {
  "1h": 3600,
  "4h": 4 * 3600,
  "1d": 86400,
  "1w": 7 * 86400,
};

/** Start (UTC, seconds) of the higher-timeframe bar a time falls in. */
function bucketStart(t: number, tf: Exclude<MaTimeframe, "chart">): number {
  if (tf === "1M") {
    const d = new Date(t * 1000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  }
  if (tf === "1w") {
    // Weeks open on Monday 00:00 UTC (1970-01-01 was a Thursday)
    const monday = 4 * 86400;
    return Math.floor((t - monday) / TF_SECONDS["1w"]) * TF_SECONDS["1w"] + monday;
  }
  return Math.floor(t / TF_SECONDS[tf]) * TF_SECONDS[tf];
}

function tfSeconds(tf: Exclude<MaTimeframe, "chart">): number {
  return tf === "1M" ? 28 * 86400 : TF_SECONDS[tf];
}

/**
 * A moving average of the closes, of any type, on the chart's timeframe or a
 * higher one. A higher-timeframe average is built from the chart's own candles
 * grouped into that timeframe, and each chart bar shows the value of the last
 * *closed* higher bar (`waitClose`), so it never repaints — a step line, as
 * on CdeCripto. A timeframe at or below the chart's is just the chart's.
 */
export function movingAverage(
  candles: Candle[],
  period: number,
  type: MaType = "EMA",
  tf: MaTimeframe = "chart",
  waitClose = true,
): IndicatorPoint[] {
  const n = Math.max(1, Math.floor(period));
  if (candles.length === 0) return [];
  const barSec = candles.length > 1 ? candles[1].time - candles[0].time : 0;

  if (tf === "chart" || (barSec > 0 && tfSeconds(tf) <= barSec)) {
    const values = averageOf(
      type,
      candles.map((c) => c.close),
      candles.map((c) => c.volume || 0),
      n,
    );
    const out: IndicatorPoint[] = [];
    values.forEach((v, i) => {
      if (v !== null) out.push({ time: candles[i].time, value: v });
    });
    return out;
  }

  // Group into the higher timeframe: close = last close, volume summed
  const starts: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];
  const bucketOf: number[] = [];
  for (const c of candles) {
    const s = bucketStart(c.time, tf);
    if (starts[starts.length - 1] !== s) {
      starts.push(s);
      closes.push(c.close);
      volumes.push(c.volume || 0);
    } else {
      closes[closes.length - 1] = c.close;
      volumes[volumes.length - 1] += c.volume || 0;
    }
    bucketOf.push(starts.length - 1);
  }
  const values = averageOf(type, closes, volumes, n);
  const out: IndicatorPoint[] = [];
  candles.forEach((c, i) => {
    const k = waitClose ? bucketOf[i] - 1 : bucketOf[i];
    const v = k >= 0 ? values[k] : null;
    if (v !== null && v !== undefined) out.push({ time: c.time, value: v });
  });
  return out;
}

/** Short label for legends: "SMA 55", "EMA 21 · 4H". */
export function maLabel(type: MaType, period: number, tf: MaTimeframe = "chart"): string {
  const tfLabel = MA_TIMEFRAMES.find((t) => t.value === tf)?.label;
  return tf === "chart" ? `${type} ${period}` : `${type} ${period} · ${tfLabel}`;
}
