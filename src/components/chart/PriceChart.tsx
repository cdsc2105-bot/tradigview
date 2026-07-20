"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  BaselineSeries,
  CrosshairMode,
  type AutoscaleInfo,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type IPriceLine,
  type LineWidth,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchKlines } from "@/lib/binance/rest";
import { fetchBitgetKlines } from "@/lib/exchanges/bitget";
import { fetchFuturesKlines } from "@/lib/exchanges/binance-futures";
import { getBinanceWS, getBinanceFuturesWS } from "@/lib/binance/ws";
import { aggregate2m, makeTwoMinuteAggregator } from "@/lib/aggregate";
import {
  ema,
  rsi,
  rsiDivergences,
  smoothSMA,
  macd,
  bollingerBands,
  stochastic,
  stochRsi,
  superTrend,
  vwap,
  waveTrend,
  ichimoku,
  cipherB,
  CIPHER_DEFAULTS,
  type CipherSignalKind,
} from "@/lib/indicators";
import type { Candle, Timeframe } from "@/lib/binance/types";
import {
  EXCHANGE_LABELS,
  INDICATOR_COLORS,
  ICHIMOKU_COLORS,
  CIPHER_COLORS,
  RSI_COLORS,
  SESSION_COLORS,
  STOCH_COLORS,
  useChartStore,
  type Exchange,
  type IndicatorConfig,
  type IndicatorKey,
  type RibbonLine,
  type VwapBand,
} from "@/lib/store/chart-store";
import {
  BandFillPrimitive,
  hexToRgba,
  type FillBand,
  type FillRegion,
} from "@/components/chart/bandFill";
import {
  SessionLinesPrimitive,
  offsetLabel,
  sessionLines,
} from "@/components/chart/sessionLines";
import { SegmentsPrimitive, type Segment } from "@/components/chart/segments";
import { formatPrice, formatVolume } from "@/lib/format";
import { IndicatorPill } from "./IndicatorPill";
import { MeasureOverlay } from "./MeasureOverlay";

interface MeasurePoint {
  time: number;
  price: number;
}
interface MeasureState {
  phase: "idle" | "placing" | "done";
  a: MeasurePoint | null;
  b: MeasurePoint | null;
}
const INITIAL_MEASURE: MeasureState = { phase: "idle", a: null, b: null };

/** What the pointer is on top of when interacting with user drawings. */
type DrawingHit =
  | { kind: "trend"; id: string; part: "p1" | "p2" | "body" }
  | { kind: "hline"; id: string };

/** Pixel distance from a point to the segment (x1,y1)–(x2,y2). */
function distToSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/** Bars back used for the volume average / relative-volume read. */
const VOL_MA_PERIOD = 21;

/**
 * Histogram bar color by relative volume (bar ÷ its average). Keeps the
 * green/red up-down hue but scales opacity so climax bars pop and quiet bars
 * fade — the quick "¿hay volumen o no?" read.
 */
function volBarColor(isUp: boolean, rvol: number): string {
  const hue = isUp ? TV_COLORS.green : TV_COLORS.red;
  // Kept semi-transparent so even climax bars sit behind the candles rather
  // than fighting them — still readable by relative intensity.
  const alpha =
    rvol >= 2 ? "aa" : // climax
    rvol >= 1.2 ? "80" : // high
    rvol >= 0.7 ? "4d" : // normal
    "26"; // low — faded
  return `${hue}${alpha}`;
}

/** Spanish label for a relative-volume reading. */
function volStateLabel(rvol: number): string {
  if (rvol >= 2) return "Muy alto";
  if (rvol >= 1.2) return "Alto";
  if (rvol >= 0.7) return "Normal";
  return "Bajo";
}

function durationLabel(aTime: number, bTime: number): string {
  const diff = Math.abs(bTime - aTime);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

interface Props {
  symbol: string;
  timeframe: Timeframe;
  exchange: Exchange;
}

/** Candle fetcher per venue — all share the (symbol, tf, limit, endTime) shape. */
const KLINE_FETCHERS: Record<
  Exchange,
  (s: string, tf: Timeframe, limit: number, endTime?: number) => Promise<Candle[]>
> = {
  binance: fetchKlines,
  binancef: fetchFuturesKlines,
  bitget: fetchBitgetKlines,
};

/**
 * Fetch candles, synthesizing the 2m interval (which no venue offers) from
 * twice as many 1m candles.
 */
async function fetchCandles(
  exchange: Exchange,
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  endTime?: number,
): Promise<Candle[]> {
  if (timeframe !== "2m") {
    return KLINE_FETCHERS[exchange](symbol, timeframe, limit, endTime);
  }
  const oneMin = await KLINE_FETCHERS[exchange](symbol, "1m", limit, endTime);
  return aggregate2m(oneMin);
}

/** Candles fetched per request, and how far back we let the buffer grow. */
const PAGE_SIZE = 1000;
const MAX_CANDLES = 20_000;
/** Start fetching older candles once the view gets this close to the oldest bar. */
const HISTORY_TRIGGER_BARS = 50;

/**
 * Enabled deviation bands, innermost → outermost. Sorted so the shaded regions
 * nest correctly no matter what order the user typed the multipliers in.
 */
function activeVwapBands(cfg: IndicatorConfig): VwapBand[] {
  return cfg.vwapBandLines
    .filter((b) => b.enabled && b.multiplier > 0)
    .sort((a, b) => a.multiplier - b.multiplier);
}

const TV_COLORS = {
  bg: "#131722",
  panel: "#1e222d",
  border: "#2a2e39",
  text: "#d1d4dc",
  textMuted: "#787b86",
  green: "#26a69a",
  red: "#ef5350",
  blue: "#2962ff",
  yellow: "#ffb74d",
  purple: "#ab47bc",
  grid: "#1e222d",
};

interface HoverInfo {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  time: number;
  pct: number;
}

interface LastValues {
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  volume?: number;
  /** Latest bar's volume ÷ its 21-bar average (relative volume) */
  volRvol?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  stochK?: number;
  stochD?: number;
  srsiK?: number;
  srsiD?: number;
  supertrend?: number;
  supertrendDir?: 1 | -1;
  vwapVal?: number;
  wt1?: number;
  wt2?: number;
  cipherWt1?: number;
  cipherWt2?: number;
  /** Last value of each EMA ribbon line, fast → slow */
  ribbon?: (number | undefined)[];
  /** Ichimoku cloud bias from the last Senkou A vs B */
  ichiBias?: "Alcista" | "Bajista";
}

interface PaneOffset {
  top: number;
  height: number;
}

export function PriceChart({ symbol, timeframe, exchange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const volumeMaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiMaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi30Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsi70Ref = useRef<ISeriesApi<"Line"> | null>(null);
  /** Purple 30–70 zone behind the RSI, like TV's default */
  const rsiFillRef = useRef<BandFillPrimitive | null>(null);
  /** Red/green divergence trend lines drawn over the RSI */
  const rsiSegRef = useRef<SegmentsPrimitive | null>(null);
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochKRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochDRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stoch20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const stoch80Ref = useRef<ISeriesApi<"Line"> | null>(null);
  /** Purple 20–80 zone behind the stochastic, TradingView-style */
  const stochFillRef = useRef<BandFillPrimitive | null>(null);
  const srsiKRef = useRef<ISeriesApi<"Line"> | null>(null);
  const srsiDRef = useRef<ISeriesApi<"Line"> | null>(null);
  const srsi20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const srsi80Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const srsiFillRef = useRef<BandFillPrimitive | null>(null);
  const stBullRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stBearRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  /** Deviation-band line series, ordered upper-innermost…outer then lower-inner…outer */
  const vwapBandRefs = useRef<ISeriesApi<"Line">[]>([]);
  const vwapFillRef = useRef<BandFillPrimitive | null>(null);
  /** End-of-line dot for the VWAP and each of its band lines */
  const vwapDotRefs = useRef<Map<ISeriesApi<"Line">, ISeriesMarkersPluginApi<Time>>>(
    new Map(),
  );
  const sessionRef = useRef<SessionLinesPrimitive | null>(null);
  /** Day range + offset the session lines were last built for */
  const sessionKeyRef = useRef("");
  const wt1Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const wt2Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const wt0Ref = useRef<ISeriesApi<"Line"> | null>(null);
  // VuManChu Cipher B pane series
  const cipherWt1Ref = useRef<ISeriesApi<"Baseline"> | null>(null);
  const cipherWt2Ref = useRef<ISeriesApi<"Baseline"> | null>(null);
  const cipherVwapRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const cipherMfiRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const cipherObRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherOsRef = useRef<ISeriesApi<"Line"> | null>(null);
  const cipher0Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const cipherMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  /** One line series per configured ribbon EMA, fast → slow */
  const ribbonRefs = useRef<ISeriesApi<"Line">[]>([]);
  const ribbonFillRef = useRef<BandFillPrimitive | null>(null);
  const ichiTenkanRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ichiKijunRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ichiSpanARef = useRef<ISeriesApi<"Line"> | null>(null);
  const ichiSpanBRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ichiChikouRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ichiCloudRef = useRef<BandFillPrimitive | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());
  /** Set by the data effect; called when the view nears the oldest loaded bar. */
  const loadMoreRef = useRef<(() => void) | null>(null);

  const indicators = useChartStore((s) => s.indicators);
  const hidden = useChartStore((s) => s.hidden);
  const config = useChartStore((s) => s.config);
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const priceLines = useChartStore((s) => s.priceLines);
  const trendLines = useChartStore((s) => s.trendLines);
  const addPriceLine = useChartStore((s) => s.addPriceLine);
  const addTrendLine = useChartStore((s) => s.addTrendLine);
  const removePriceLine = useChartStore((s) => s.removePriceLine);
  const removeTrendLine = useChartStore((s) => s.removeTrendLine);
  const movePriceLine = useChartStore((s) => s.movePriceLine);
  const moveTrendLine = useChartStore((s) => s.moveTrendLine);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const toggleHidden = useChartStore((s) => s.toggleHidden);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);
  const maximizedPane = useChartStore((s) => s.maximizedPane);
  const toggleMaximizedPane = useChartStore((s) => s.toggleMaximizedPane);

  // Refs to avoid recreating subscribeClick on every tool change
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const setToolRef = useRef(setTool);
  setToolRef.current = setTool;
  const addPriceLineRef = useRef(addPriceLine);
  addPriceLineRef.current = addPriceLine;
  const addTrendLineRef = useRef(addTrendLine);
  addTrendLineRef.current = addTrendLine;
  const removePriceLineRef = useRef(removePriceLine);
  removePriceLineRef.current = removePriceLine;
  const removeTrendLineRef = useRef(removeTrendLine);
  removeTrendLineRef.current = removeTrendLine;
  const movePriceLineRef = useRef(movePriceLine);
  movePriceLineRef.current = movePriceLine;
  const moveTrendLineRef = useRef(moveTrendLine);
  moveTrendLineRef.current = moveTrendLine;
  const indicatorsRef = useRef(indicators);
  indicatorsRef.current = indicators;
  const toggleMaximizedPaneRef = useRef(toggleMaximizedPane);
  toggleMaximizedPaneRef.current = toggleMaximizedPane;
  const trendLinesRef = useRef(trendLines);
  trendLinesRef.current = trendLines;
  const priceLinesRef = useRef(priceLines);
  priceLinesRef.current = priceLines;
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const configRef = useRef(config);
  configRef.current = config;
  const ribbonVisibleRef = useRef(false);
  ribbonVisibleRef.current = indicators.ribbon && !hidden.ribbon;
  const vwapVisibleRef = useRef(false);
  vwapVisibleRef.current = indicators.vwap && !hidden.vwap;
  const ichiVisibleRef = useRef(false);
  ichiVisibleRef.current = indicators.ichimoku && !hidden.ichimoku;
  const sessionVisibleRef = useRef(false);
  sessionVisibleRef.current = indicators.session && !hidden.session;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const indicatorsVisibleRef = useRef({ stoch: false, stochrsi: false });
  indicatorsVisibleRef.current = {
    stoch: indicators.stoch && !hidden.stoch,
    stochrsi: indicators.stochrsi && !hidden.stochrsi,
  };

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [lastPrice, setLastPrice] = useState<{ value: number; pct: number } | null>(null);
  const [lastValues, setLastValues] = useState<LastValues>({});
  const [paneOffsets, setPaneOffsets] = useState<PaneOffset[]>([]);
  const [measure, setMeasure] = useState<MeasureState>(INITIAL_MEASURE);
  const [renderTick, setRenderTick] = useState(0);
  const measureRef = useRef(measure);
  measureRef.current = measure;
  /** Trend line being placed (first click done, second pending) */
  const [trendDraft, setTrendDraft] = useState<MeasureState>(INITIAL_MEASURE);
  const trendDraftRef = useRef(trendDraft);
  trendDraftRef.current = trendDraft;
  /** User-drawn trend lines, painted on the candles pane */
  const trendSegRef = useRef<SegmentsPrimitive | null>(null);

  // Helper — compute pane top offsets from chart layout
  function recomputePaneOffsets() {
    if (!chartRef.current) return;
    const panes = chartRef.current.panes();
    let top = 0;
    const offsets: PaneOffset[] = panes.map((p) => {
      const h = p.getHeight();
      const o = { top, height: h };
      top += h;
      return o;
    });
    setPaneOffsets(offsets);
  }

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: TV_COLORS.bg },
        textColor: TV_COLORS.text,
        fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: TV_COLORS.border, separatorHoverColor: TV_COLORS.border },
      },
      grid: {
        vertLines: { color: TV_COLORS.grid },
        horzLines: { color: TV_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
        horzLine: { color: TV_COLORS.textMuted, width: 1, style: 3, labelBackgroundColor: TV_COLORS.panel },
      },
      rightPriceScale: {
        borderColor: TV_COLORS.border,
        textColor: TV_COLORS.textMuted,
      },
      // Show times in the viewer's local timezone (like TradingView and Matt's
      // UTC+2 chart) instead of the library's UTC default, so the same candle
      // lines up under the same clock label.
      localization: {
        timeFormatter: (t: number) => {
          const d = new Date(t * 1000);
          return d.toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        },
      },
      timeScale: {
        borderColor: TV_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        tickMarkFormatter: (t: number, tickType: number) => {
          const d = new Date(t * 1000);
          // Day-level marks (Year=0, Month=1, DayOfMonth=2) show the date;
          // intraday marks show local HH:mm.
          if (tickType <= 2) {
            return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
          }
          return `${String(d.getHours()).padStart(2, "0")}:${String(
            d.getMinutes(),
          ).padStart(2, "0")}`;
        },
      },
      autoSize: true,
    });

    // PANE 0 — Candles + EMAs
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: TV_COLORS.green,
      downColor: TV_COLORS.red,
      borderUpColor: TV_COLORS.green,
      borderDownColor: TV_COLORS.red,
      wickUpColor: TV_COLORS.green,
      wickDownColor: TV_COLORS.red,
      priceLineColor: TV_COLORS.textMuted,
      priceLineStyle: 2,
    });

    ema20Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema20,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema50Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema50,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema200Ref.current = chart.addSeries(LineSeries, {
      color: INDICATOR_COLORS.ema200,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    ribbonFillRef.current = new BandFillPrimitive();
    candleSeriesRef.current.attachPrimitive(ribbonFillRef.current);
    vwapFillRef.current = new BandFillPrimitive();
    candleSeriesRef.current.attachPrimitive(vwapFillRef.current);
    ichiCloudRef.current = new BandFillPrimitive();
    candleSeriesRef.current.attachPrimitive(ichiCloudRef.current);
    sessionRef.current = new SessionLinesPrimitive();
    candleSeriesRef.current.attachPrimitive(sessionRef.current);
    trendSegRef.current = new SegmentsPrimitive();
    candleSeriesRef.current.attachPrimitive(trendSegRef.current);

    chartRef.current = chart;

    // Click handler — add horizontal price line when hline tool is active
    chart.subscribeClick((param) => {
      if (!param.point || !candleSeriesRef.current) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (price === null || !isFinite(price)) return;

      if (toolRef.current === "hline") {
        addPriceLineRef.current(price, symbolRef.current);
        return;
      }

      if (toolRef.current === "trend") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = trendDraftRef.current;
        if (current.phase === "idle") {
          setTrendDraft({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        } else if (current.phase === "placing" && current.a) {
          addTrendLineRef.current({
            symbol: symbolRef.current,
            t1: current.a.time,
            p1: current.a.price,
            t2: time,
            p2: price,
          });
          setTrendDraft(INITIAL_MEASURE);
          setToolRef.current("cursor"); // back to navigation, like TradingView
        }
        return;
      }

      if (toolRef.current === "measure") {
        if (!param.time) return;
        const time = Number(param.time);
        const current = measureRef.current;
        if (current.phase === "idle") {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        } else if (current.phase === "placing") {
          setMeasure({
            phase: "done",
            a: current.a,
            b: { time, price },
          });
        } else {
          setMeasure({
            phase: "placing",
            a: { time, price },
            b: { time, price },
          });
        }
      }
    });

    // Crosshair handler
    chart.subscribeCrosshairMove((param) => {
      if (
        toolRef.current === "measure" &&
        measureRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = Number(param.time);
          setMeasure((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      // Trend line preview follows the crosshair between the two clicks
      if (
        toolRef.current === "trend" &&
        trendDraftRef.current.phase === "placing" &&
        param.point &&
        param.time &&
        candleSeriesRef.current
      ) {
        const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (price !== null && isFinite(price)) {
          const time = Number(param.time);
          setTrendDraft((prev) =>
            prev.phase === "placing" ? { ...prev, b: { time, price } } : prev,
          );
        }
      }

      if (!param.time || !candleSeriesRef.current) {
        setHover(null);
        return;
      }
      const data = param.seriesData.get(candleSeriesRef.current);
      const vol = volumeSeriesRef.current
        ? param.seriesData.get(volumeSeriesRef.current)
        : null;
      if (data && "open" in data) {
        const o = data.open as number;
        const c = data.close as number;
        setHover({
          o,
          h: data.high as number,
          l: data.low as number,
          c,
          v: vol && "value" in vol ? (vol.value as number) : 0,
          time: Number(param.time),
          pct: o === 0 ? 0 : ((c - o) / o) * 100,
        });
      }
    });

    // Re-render measure overlay on pan / zoom so pixel coords stay in sync, and
    // pull in older candles as the view approaches the start of what's loaded.
    const tsRangeHandler = () => setRenderTick((t) => t + 1);
    chart.timeScale().subscribeVisibleTimeRangeChange(tsRangeHandler);
    const logicalRangeHandler = (range: { from: number; to: number } | null) => {
      setRenderTick((t) => t + 1);
      if (range && range.from < HISTORY_TRIGGER_BARS) loadMoreRef.current?.();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(logicalRangeHandler);

    // ResizeObserver — recompute pane offsets when chart container resizes
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => recomputePaneOffsets());
    });
    ro.observe(containerRef.current);
    recomputePaneOffsets();

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(tsRangeHandler);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(logicalRangeHandler);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      volumeMaRef.current = null;
      priceLinesMapRef.current.clear();
      ema20Ref.current = null;
      ema50Ref.current = null;
      ema200Ref.current = null;
      ribbonRefs.current = [];
      ribbonFillRef.current = null;
      ichiTenkanRef.current = null;
      ichiKijunRef.current = null;
      ichiSpanARef.current = null;
      ichiSpanBRef.current = null;
      ichiChikouRef.current = null;
      ichiCloudRef.current = null;
      rsiRef.current = null;
      rsiMaRef.current = null;
      rsi30Ref.current = null;
      rsi50Ref.current = null;
      rsi70Ref.current = null;
      rsiFillRef.current = null;
      rsiSegRef.current = null;
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
      bbUpperRef.current = null;
      bbMiddleRef.current = null;
      bbLowerRef.current = null;
      stochKRef.current = null;
      stochDRef.current = null;
      stoch20Ref.current = null;
      stoch80Ref.current = null;
      stochFillRef.current = null;
      srsiKRef.current = null;
      srsiDRef.current = null;
      srsi20Ref.current = null;
      srsi80Ref.current = null;
      srsiFillRef.current = null;
      stBullRef.current = null;
      stBearRef.current = null;
      vwapRef.current = null;
      vwapBandRefs.current = [];
      vwapFillRef.current = null;
      vwapDotRefs.current.clear();
      sessionRef.current = null;
      trendSegRef.current = null;
      wt1Ref.current = null;
      wt2Ref.current = null;
      wt0Ref.current = null;
    };
  }, []);

  // Manage volume — overlay at the bottom of the main pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.volume && !volumeSeriesRef.current) {
      const v = chartRef.current.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
          color: TV_COLORS.textMuted,
          priceLineVisible: false,
          lastValueVisible: false,
          // Cap the scale near the 90th-percentile bar so a single climax spike
          // clips at the top instead of squashing every normal bar to a sliver.
          autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
            const res = original();
            const vols = candlesRef.current
              .map((c) => c.volume)
              .filter((x) => x > 0)
              .sort((a, b) => a - b);
            if (vols.length === 0) return res;
            const p90 = vols[Math.min(vols.length - 1, Math.floor(vols.length * 0.9))];
            const cap = p90 * 1.4;
            const currentMax = res?.priceRange?.maxValue ?? cap;
            return {
              priceRange: {
                minValue: 0,
                maxValue: Math.min(currentMax, cap),
              },
            };
          },
        },
        0,
      );
      // Volume lives in a thin strip at the very bottom (~15%) so it never
      // reaches up into the candles and clutters the price action.
      v.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volumeSeriesRef.current = v;
      // Volume moving-average line (red), on the same volume price scale
      volumeMaRef.current = chartRef.current.addSeries(
        LineSeries,
        {
          priceScaleId: "volume",
          color: TV_COLORS.red,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        0,
      );
      updateVolume();
    } else if (!indicators.volume && volumeSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      if (volumeMaRef.current) chartRef.current.removeSeries(volumeMaRef.current);
      volumeSeriesRef.current = null;
      volumeMaRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [indicators.volume]);

  // RSI pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.rsi && !rsiRef.current) {
      const paneIndex = 1;
      const guide = () =>
        chartRef.current!.addSeries(
          LineSeries,
          {
            color: TV_COLORS.textMuted,
            lineWidth: 1,
            lineStyle: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          paneIndex,
        );
      const r = chartRef.current.addSeries(
        LineSeries,
        {
          color: configRef.current.rsiColor,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
        },
        paneIndex,
      );
      // MA over the RSI (yellow), like CdeCripto's panel
      const rMa = chartRef.current.addSeries(
        LineSeries,
        {
          color: configRef.current.rsiMaColor,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      rsiRef.current = r;
      rsiMaRef.current = rMa;
      rsi30Ref.current = guide();
      rsi50Ref.current = guide();
      rsi70Ref.current = guide();
      rsiFillRef.current = new BandFillPrimitive();
      r.attachPrimitive(rsiFillRef.current);
      rsiSegRef.current = new SegmentsPrimitive();
      r.attachPrimitive(rsiSegRef.current);
      try {
        chartRef.current.panes()[1]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateRSI();
    } else if (!indicators.rsi && rsiRef.current && chartRef.current) {
      chartRef.current.removeSeries(rsiRef.current);
      if (rsiMaRef.current) chartRef.current.removeSeries(rsiMaRef.current);
      if (rsi30Ref.current) chartRef.current.removeSeries(rsi30Ref.current);
      if (rsi50Ref.current) chartRef.current.removeSeries(rsi50Ref.current);
      if (rsi70Ref.current) chartRef.current.removeSeries(rsi70Ref.current);
      rsiRef.current = null;
      rsiMaRef.current = null;
      rsi30Ref.current = null;
      rsi50Ref.current = null;
      rsi70Ref.current = null;
      rsiFillRef.current = null;
      rsiSegRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.rsi]);

  // MACD pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.macd && !macdRef.current) {
      const paneIndex = indicators.rsi ? 2 : 1;
      const m = chartRef.current.addSeries(
        LineSeries,
        {
          color: INDICATOR_COLORS.macd,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const s = chartRef.current.addSeries(
        LineSeries,
        {
          color: TV_COLORS.yellow,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        paneIndex,
      );
      const h = chartRef.current.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      );
      macdRef.current = m;
      macdSignalRef.current = s;
      macdHistRef.current = h;
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateMACD();
    } else if (!indicators.macd && macdRef.current && chartRef.current) {
      if (macdRef.current) chartRef.current.removeSeries(macdRef.current);
      if (macdSignalRef.current) chartRef.current.removeSeries(macdSignalRef.current);
      if (macdHistRef.current) chartRef.current.removeSeries(macdHistRef.current);
      macdRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.macd, indicators.rsi]);

  // Bollinger Bands — overlay on main pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.bb && !bbUpperRef.current) {
      const bbColor = INDICATOR_COLORS.bb;
      bbUpperRef.current = chartRef.current.addSeries(LineSeries, {
        color: bbColor,
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      bbMiddleRef.current = chartRef.current.addSeries(LineSeries, {
        color: bbColor,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      bbLowerRef.current = chartRef.current.addSeries(LineSeries, {
        color: bbColor,
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      updateBB();
    } else if (!indicators.bb && bbUpperRef.current && chartRef.current) {
      chartRef.current.removeSeries(bbUpperRef.current);
      chartRef.current.removeSeries(bbMiddleRef.current!);
      chartRef.current.removeSeries(bbLowerRef.current!);
      bbUpperRef.current = null;
      bbMiddleRef.current = null;
      bbLowerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.bb]);

  // Stochastic pane — TradingView styling: %K blue, %D orange, purple 20–80 zone
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.stoch && !stochKRef.current) {
      const paneIndex = 1 + (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0);
      stochKRef.current = chartRef.current.addSeries(LineSeries, {
        color: STOCH_COLORS.k,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
      }, paneIndex);
      stochDRef.current = chartRef.current.addSeries(LineSeries, {
        color: STOCH_COLORS.d,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      }, paneIndex);
      stoch20Ref.current = chartRef.current.addSeries(LineSeries, {
        color: TV_COLORS.textMuted,
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      }, paneIndex);
      stoch80Ref.current = chartRef.current.addSeries(LineSeries, {
        color: TV_COLORS.textMuted,
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      }, paneIndex);
      stochFillRef.current = new BandFillPrimitive();
      stochKRef.current.attachPrimitive(stochFillRef.current);
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateStoch();
    } else if (!indicators.stoch && stochKRef.current && chartRef.current) {
      chartRef.current.removeSeries(stochKRef.current);
      if (stochDRef.current) chartRef.current.removeSeries(stochDRef.current);
      if (stoch20Ref.current) chartRef.current.removeSeries(stoch20Ref.current);
      if (stoch80Ref.current) chartRef.current.removeSeries(stoch80Ref.current);
      stochKRef.current = null;
      stochDRef.current = null;
      stoch20Ref.current = null;
      stoch80Ref.current = null;
      stochFillRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.stoch, indicators.rsi, indicators.macd]);

  // Stochastic RSI pane — same styling, applied to the RSI instead of price
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.stochrsi && !srsiKRef.current) {
      const paneIndex =
        1 +
        (indicators.rsi ? 1 : 0) +
        (indicators.macd ? 1 : 0) +
        (indicators.stoch ? 1 : 0);
      srsiKRef.current = chartRef.current.addSeries(LineSeries, {
        color: STOCH_COLORS.k,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
      }, paneIndex);
      srsiDRef.current = chartRef.current.addSeries(LineSeries, {
        color: STOCH_COLORS.d,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      }, paneIndex);
      srsi20Ref.current = chartRef.current.addSeries(LineSeries, {
        color: TV_COLORS.textMuted,
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      }, paneIndex);
      srsi80Ref.current = chartRef.current.addSeries(LineSeries, {
        color: TV_COLORS.textMuted,
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      }, paneIndex);
      srsiFillRef.current = new BandFillPrimitive();
      srsiKRef.current.attachPrimitive(srsiFillRef.current);
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateStochRsi();
    } else if (!indicators.stochrsi && srsiKRef.current && chartRef.current) {
      chartRef.current.removeSeries(srsiKRef.current);
      if (srsiDRef.current) chartRef.current.removeSeries(srsiDRef.current);
      if (srsi20Ref.current) chartRef.current.removeSeries(srsi20Ref.current);
      if (srsi80Ref.current) chartRef.current.removeSeries(srsi80Ref.current);
      srsiKRef.current = null;
      srsiDRef.current = null;
      srsi20Ref.current = null;
      srsi80Ref.current = null;
      srsiFillRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.stochrsi, indicators.rsi, indicators.macd, indicators.stoch]);

  // SuperTrend — overlay on main pane (two line series: bull and bear)
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.supertrend && !stBullRef.current) {
      stBullRef.current = chartRef.current.addSeries(LineSeries, {
        color: INDICATOR_COLORS.supertrend,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      stBearRef.current = chartRef.current.addSeries(LineSeries, {
        color: "#ef5350",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      updateSuperTrend();
    } else if (!indicators.supertrend && stBullRef.current && chartRef.current) {
      chartRef.current.removeSeries(stBullRef.current);
      chartRef.current.removeSeries(stBearRef.current!);
      stBullRef.current = null;
      stBearRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.supertrend]);

  // VWAP — center line + N deviation bands per side, overlaid on the main pane.
  // The band count is configurable, so band series are created/destroyed here.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (indicators.vwap && !vwapRef.current) {
      vwapRef.current = chart.addSeries(LineSeries, {
        color: config.vwapColor,
        lineWidth: 2,
        priceLineVisible: false,
        // The price label on the right axis is what makes each level readable
        // at a glance, the way CdeCripto shows them.
        lastValueVisible: true,
      });
    } else if (!indicators.vwap && vwapRef.current) {
      chart.removeSeries(vwapRef.current);
      vwapBandRefs.current.forEach((s) => chart.removeSeries(s));
      vwapDotRefs.current.clear();
      vwapRef.current = null;
      vwapBandRefs.current = [];
      vwapFillRef.current?.setRegions([], false);
      return;
    }

    if (!vwapRef.current) return;

    vwapRef.current.applyOptions({ color: config.vwapColor });

    // Two band lines per level (upper + lower). Reconcile the pool to 2×count.
    const bands = activeVwapBands(config);
    const refs = vwapBandRefs.current;
    const wanted = bands.length * 2;
    while (refs.length > wanted) {
      const s = refs.pop();
      if (s) {
        vwapDotRefs.current.delete(s);
        chart.removeSeries(s);
      }
    }
    while (refs.length < wanted) {
      refs.push(
        chart.addSeries(LineSeries, {
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
        }),
      );
    }

    // refs are [upper #1, lower #1, upper #2, …] — both sides of a level share its color.
    bands.forEach((band, k) => {
      [refs[k * 2], refs[k * 2 + 1]].forEach((s) =>
        s?.applyOptions({ color: band.color, visible: !hidden.vwap }),
      );
    });

    updateVWAP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    indicators.vwap,
    hidden.vwap,
    config.vwapBandLines,
    config.vwapColor,
    config.vwapFillColor,
    config.vwapFill,
    config.vwapFillOpacity,
  ]);

  // Ichimoku Cloud — 5 lines + shaded cloud, all on the main pane
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (indicators.ichimoku && !ichiTenkanRef.current) {
      const line = (color: string, width: number, style = 0) =>
        chart.addSeries(LineSeries, {
          color,
          lineWidth: width as LineWidth,
          lineStyle: style,
          priceLineVisible: false,
          lastValueVisible: false,
        });
      ichiTenkanRef.current = line(ICHIMOKU_COLORS.tenkan, 1);
      ichiKijunRef.current = line(ICHIMOKU_COLORS.kijun, 1);
      ichiSpanARef.current = line(ICHIMOKU_COLORS.senkouA, 1);
      ichiSpanBRef.current = line(ICHIMOKU_COLORS.senkouB, 1);
      ichiChikouRef.current = line(ICHIMOKU_COLORS.chikou, 1, 2);
      updateIchimoku();
    } else if (!indicators.ichimoku && ichiTenkanRef.current) {
      [
        ichiTenkanRef,
        ichiKijunRef,
        ichiSpanARef,
        ichiSpanBRef,
        ichiChikouRef,
      ].forEach((r) => {
        if (r.current) chart.removeSeries(r.current);
        r.current = null;
      });
      ichiCloudRef.current?.setRegions([], false);
      return;
    }

    if (ichiTenkanRef.current) updateIchimoku();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    indicators.ichimoku,
    hidden.ichimoku,
    config.ichiTenkan,
    config.ichiKijun,
    config.ichiSenkouB,
    config.ichiDisplacement,
  ]);

  // WaveTrend pane
  useEffect(() => {
    if (!chartRef.current) return;
    if (indicators.wavetrend && !wt1Ref.current) {
      const paneIndex = 1 + (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + (indicators.stoch ? 1 : 0) + (indicators.stochrsi ? 1 : 0);
      wt1Ref.current = chartRef.current.addSeries(LineSeries, { color: INDICATOR_COLORS.wavetrend, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      wt2Ref.current = chartRef.current.addSeries(LineSeries, { color: "#ff5722", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      wt0Ref.current = chartRef.current.addSeries(LineSeries, { color: TV_COLORS.textMuted, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      try {
        chartRef.current.panes()[paneIndex]?.setStretchFactor(1);
        chartRef.current.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateWaveTrend();
    } else if (!indicators.wavetrend && wt1Ref.current && chartRef.current) {
      chartRef.current.removeSeries(wt1Ref.current);
      if (wt2Ref.current) chartRef.current.removeSeries(wt2Ref.current);
      if (wt0Ref.current) chartRef.current.removeSeries(wt0Ref.current);
      wt1Ref.current = null;
      wt2Ref.current = null;
      wt0Ref.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators.wavetrend, indicators.rsi, indicators.macd, indicators.stoch, indicators.stochrsi]);

  // VuManChu Cipher B pane — WT areas + fast-wave VWAP + RSI/MFI area + circles
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.cipher && !cipherWt2Ref.current) {
      const paneIndex =
        1 +
        (indicators.rsi ? 1 : 0) +
        (indicators.macd ? 1 : 0) +
        (indicators.stoch ? 1 : 0) +
        (indicators.stochrsi ? 1 : 0) +
        (indicators.wavetrend ? 1 : 0);

      const baseline = (top: string, bottom: string, lineColor: string) =>
        chart.addSeries(
          BaselineSeries,
          {
            baseValue: { type: "price", price: 0 },
            topLineColor: lineColor,
            bottomLineColor: lineColor,
            topFillColor1: top,
            topFillColor2: top,
            bottomFillColor1: bottom,
            bottomFillColor2: bottom,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          paneIndex,
        );

      // Draw order: WT2 (purple, widest) under WT1 (blue), then fast-wave + MFI.
      cipherWt2Ref.current = baseline(
        hexToRgba(CIPHER_COLORS.wt2, 55),
        hexToRgba(CIPHER_COLORS.wt2, 55),
        hexToRgba(CIPHER_COLORS.wt2, 0),
      );
      cipherWt1Ref.current = baseline(
        hexToRgba(CIPHER_COLORS.wt1, 45),
        hexToRgba(CIPHER_COLORS.wt1, 45),
        hexToRgba(CIPHER_COLORS.wt1, 0),
      );
      cipherVwapRef.current = baseline(
        hexToRgba(CIPHER_COLORS.vwap, 30),
        hexToRgba(CIPHER_COLORS.vwap, 30),
        hexToRgba(CIPHER_COLORS.vwap, 55),
      );
      cipherMfiRef.current = baseline(
        hexToRgba(CIPHER_COLORS.mfiUp, 50),
        hexToRgba(CIPHER_COLORS.mfiDown, 50),
        hexToRgba(CIPHER_COLORS.mfiUp, 0),
      );

      const guide = (level: number, color: string, style = 2) =>
        chart.addSeries(
          LineSeries,
          {
            color,
            lineWidth: 1,
            lineStyle: style,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          paneIndex,
        );
      cipher0Ref.current = guide(0, hexToRgba("#ffffff", 25));
      cipherObRef.current = guide(CIPHER_DEFAULTS.obLevel, hexToRgba("#ffffff", 15));
      cipherOsRef.current = guide(CIPHER_DEFAULTS.osLevel, hexToRgba("#ffffff", 15));

      cipherMarkersRef.current = createSeriesMarkers(cipherWt2Ref.current, []);

      try {
        chart.panes()[paneIndex]?.setStretchFactor(1);
        chart.panes()[0]?.setStretchFactor(3);
      } catch {}
      updateCipher();
    } else if (!indicators.cipher && cipherWt2Ref.current && chart) {
      [
        cipherWt1Ref,
        cipherWt2Ref,
        cipherVwapRef,
        cipherMfiRef,
        cipherObRef,
        cipherOsRef,
        cipher0Ref,
      ].forEach((r) => {
        if (r.current) chart.removeSeries(r.current);
        r.current = null;
      });
      cipherMarkersRef.current = null;
    }
    requestAnimationFrame(() => recomputePaneOffsets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    indicators.cipher,
    indicators.rsi,
    indicators.macd,
    indicators.stoch,
    indicators.stochrsi,
    indicators.wavetrend,
  ]);

  // Visibility — eye toggle (hidden state) + enabled state combined
  useEffect(() => {
    const v = (key: IndicatorKey) => indicators[key] && !hidden[key];
    ema20Ref.current?.applyOptions({ visible: v("ema20") });
    ema50Ref.current?.applyOptions({ visible: v("ema50") });
    ema200Ref.current?.applyOptions({ visible: v("ema200") });
    if (rsiRef.current) {
      rsiRef.current.applyOptions({ visible: v("rsi") });
      updateRSI(); // divergence markers follow the eye toggle
    }
    if (rsiMaRef.current) rsiMaRef.current.applyOptions({ visible: v("rsi") });
    if (rsi30Ref.current) rsi30Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi50Ref.current) rsi50Ref.current.applyOptions({ visible: v("rsi") });
    if (rsi70Ref.current) rsi70Ref.current.applyOptions({ visible: v("rsi") });
    if (macdRef.current) macdRef.current.applyOptions({ visible: v("macd") });
    if (macdSignalRef.current) macdSignalRef.current.applyOptions({ visible: v("macd") });
    if (macdHistRef.current) macdHistRef.current.applyOptions({ visible: v("macd") });
    if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: v("volume") });
    if (volumeMaRef.current) volumeMaRef.current.applyOptions({ visible: v("volume") });
    if (bbUpperRef.current) bbUpperRef.current.applyOptions({ visible: v("bb") });
    if (bbMiddleRef.current) bbMiddleRef.current.applyOptions({ visible: v("bb") });
    if (bbLowerRef.current) bbLowerRef.current.applyOptions({ visible: v("bb") });
    if (stochKRef.current) {
      stochKRef.current.applyOptions({ visible: v("stoch") });
      stochDRef.current?.applyOptions({ visible: v("stoch") });
      stoch20Ref.current?.applyOptions({ visible: v("stoch") });
      stoch80Ref.current?.applyOptions({ visible: v("stoch") });
      updateStoch(); // refresh the purple zone for the new visibility
    }
    if (srsiKRef.current) {
      srsiKRef.current.applyOptions({ visible: v("stochrsi") });
      srsiDRef.current?.applyOptions({ visible: v("stochrsi") });
      srsi20Ref.current?.applyOptions({ visible: v("stochrsi") });
      srsi80Ref.current?.applyOptions({ visible: v("stochrsi") });
      updateStochRsi();
    }
    if (stBullRef.current) stBullRef.current.applyOptions({ visible: v("supertrend") });
    if (stBearRef.current) stBearRef.current.applyOptions({ visible: v("supertrend") });
    if (vwapRef.current) {
      vwapRef.current.applyOptions({ visible: v("vwap") });
      vwapBandRefs.current.forEach((s) => s.applyOptions({ visible: v("vwap") }));
      updateVWAP(); // refresh the shaded fill for the new visibility
    }
    if (wt1Ref.current) wt1Ref.current.applyOptions({ visible: v("wavetrend") });
    if (wt2Ref.current) wt2Ref.current.applyOptions({ visible: v("wavetrend") });
    if (wt0Ref.current) wt0Ref.current.applyOptions({ visible: v("wavetrend") });
    if (cipherWt2Ref.current) {
      const vis = v("cipher");
      [
        cipherWt1Ref,
        cipherWt2Ref,
        cipherVwapRef,
        cipherMfiRef,
        cipherObRef,
        cipherOsRef,
        cipher0Ref,
      ].forEach((r) => r.current?.applyOptions({ visible: vis }));
      if (vis) updateCipher();
      else cipherMarkersRef.current?.setMarkers([]);
    }
    if (ichiTenkanRef.current) {
      const vis = v("ichimoku");
      ichiTenkanRef.current.applyOptions({ visible: vis });
      ichiKijunRef.current?.applyOptions({ visible: vis });
      ichiSpanARef.current?.applyOptions({ visible: vis });
      ichiSpanBRef.current?.applyOptions({ visible: vis });
      ichiChikouRef.current?.applyOptions({ visible: vis });
      updateIchimoku(); // refresh cloud fill for the new visibility
    }
  }, [indicators, hidden]);

  // Recompute indicators when config changes (periods)
  useEffect(() => {
    updateEMAs();
  }, [config.ema20, config.ema50, config.ema200]);

  // Keep one line series per configured ribbon EMA. The count can change at
  // runtime (user adds/removes lines), so series are created and destroyed here
  // rather than up front with the rest of the chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const lines = config.ribbonLines;
    const refs = ribbonRefs.current;

    while (refs.length > lines.length) {
      const series = refs.pop();
      if (series) chart.removeSeries(series);
    }
    while (refs.length < lines.length) {
      refs.push(
        chart.addSeries(LineSeries, {
          priceLineVisible: false,
          lastValueVisible: false,
          visible: false,
        }),
      );
    }

    const show = indicators.ribbon && !hidden.ribbon;
    lines.forEach((line, i) => {
      refs[i].applyOptions({
        color: line.color,
        lineWidth: line.width as LineWidth,
        visible: show && line.enabled,
      });
    });

    updateRibbon();
  }, [config.ribbonLines, indicators.ribbon, hidden.ribbon]);

  // Repaint the shaded band when its own settings change
  useEffect(() => {
    updateRibbon();
  }, [config.ribbonFill, config.ribbonFillOpacity]);

  useEffect(() => {
    updateRSI();
  }, [
    config.rsi,
    config.rsiDiv,
    config.rsiDivLeft,
    config.rsiDivRight,
    config.rsiMa,
    config.rsiMaPeriod,
    config.rsiColor,
    config.rsiMaColor,
  ]);

  useEffect(() => {
    updateSessionLines();
  }, [indicators.session, hidden.session, config.sessionOffsetMin, timeframe]);

  useEffect(() => {
    updateMACD();
  }, [config.macdFast, config.macdSlow, config.macdSignal]);

  useEffect(() => {
    updateBB();
  }, [config.bbPeriod, config.bbStdDev]);

  useEffect(() => {
    updateStoch();
  }, [config.stochK, config.stochD, config.stochSmooth]);

  useEffect(() => {
    updateStochRsi();
  }, [config.srsiRsiLen, config.srsiStochLen, config.srsiK, config.srsiD]);

  useEffect(() => {
    updateSuperTrend();
  }, [config.stPeriod, config.stMultiplier]);

  useEffect(() => {
    updateWaveTrend();
  }, [config.wtChannel, config.wtAvg, config.wtSignal]);

  // Sync price lines from store to the candle series
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    const map = priceLinesMapRef.current;
    const linesForThisSymbol = priceLines.filter((p) => p.symbol === symbol);
    const activeIds = new Set(linesForThisSymbol.map((p) => p.id));

    for (const [id, apiLine] of map.entries()) {
      if (!activeIds.has(id)) {
        try {
          series.removePriceLine(apiLine);
        } catch {}
        map.delete(id);
      }
    }
    for (const pl of linesForThisSymbol) {
      const existing = map.get(pl.id);
      if (existing) {
        existing.applyOptions({ price: pl.price }); // follows drag-to-move
      } else {
        const apiLine = series.createPriceLine({
          price: pl.price,
          color: TV_COLORS.blue,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "",
        });
        map.set(pl.id, apiLine);
      }
    }
  }, [priceLines, symbol]);

  // Cursor style when drawing tools are active + reset drafts on tool change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.cursor =
        tool === "hline" || tool === "measure" || tool === "trend"
          ? "crosshair"
          : "";
    }
    if (tool !== "measure") setMeasure(INITIAL_MEASURE);
    if (tool !== "trend") setTrendDraft(INITIAL_MEASURE);
  }, [tool]);

  /**
   * Which drawing (if any) sits under the given container-relative pixel.
   * Endpoints win over line bodies so grabbing a handle feels precise.
   */
  function hitTestDrawings(x: number, y: number): DrawingHit | null {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    // Drawings live on the main pane only
    const paneHeight = chart.panes()[0]?.getHeight() ?? Infinity;
    if (y > paneHeight) return null;

    const ts = chart.timeScale();
    const TOL = 6;
    const HANDLE = 9;

    for (const t of trendLinesRef.current) {
      if (t.symbol !== symbolRef.current) continue;
      const x1 = ts.timeToCoordinate(t.t1 as UTCTimestamp);
      const x2 = ts.timeToCoordinate(t.t2 as UTCTimestamp);
      const y1 = series.priceToCoordinate(t.p1);
      const y2 = series.priceToCoordinate(t.p2);
      if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
      if (Math.hypot(x - x1, y - y1) <= HANDLE) return { kind: "trend", id: t.id, part: "p1" };
      if (Math.hypot(x - x2, y - y2) <= HANDLE) return { kind: "trend", id: t.id, part: "p2" };
      if (distToSegment(x, y, x1, y1, x2, y2) <= TOL) return { kind: "trend", id: t.id, part: "body" };
    }

    for (const p of priceLinesRef.current) {
      if (p.symbol !== symbolRef.current) continue;
      const py = series.priceToCoordinate(p.price);
      if (py !== null && Math.abs(y - py) <= TOL) return { kind: "hline", id: p.id };
    }
    return null;
  }

  // Selective erase + drag-to-move. A capture-phase mousedown wins the race
  // against the chart's own pan handler, so grabbing a line doesn't scroll
  // the chart, and the eraser deletes exactly the drawing under the click.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    interface DragState {
      hit: DrawingHit;
      startX: number;
      startY: number;
      orig: { t1: number; p1: number; t2: number; p2: number } | { price: number };
    }
    let drag: DragState | null = null;

    const posOf = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const toolNow = toolRef.current;
      if (toolNow !== "cursor" && toolNow !== "eraser") return;
      const { x, y } = posOf(e);
      const hit = hitTestDrawings(x, y);
      if (!hit) return;

      e.preventDefault();
      e.stopPropagation(); // keep lightweight-charts from starting a pan

      if (toolNow === "eraser") {
        if (hit.kind === "trend") removeTrendLineRef.current(hit.id);
        else removePriceLineRef.current(hit.id);
        return;
      }

      const orig =
        hit.kind === "trend"
          ? (() => {
              const t = trendLinesRef.current.find((l) => l.id === hit.id)!;
              return { t1: t.t1, p1: t.p1, t2: t.t2, p2: t.p2 };
            })()
          : { price: priceLinesRef.current.find((p) => p.id === hit.id)!.price };
      drag = { hit, startX: x, startY: y, orig };
      el.style.cursor = "grabbing";
    };

    const onMove = (e: MouseEvent) => {
      if (!drag) {
        // Hover feedback: show a grab hand over anything draggable
        const toolNow = toolRef.current;
        if (toolNow === "cursor" || toolNow === "eraser") {
          const { x, y } = posOf(e);
          const hit = hitTestDrawings(x, y);
          el.style.cursor = hit ? (toolNow === "eraser" ? "pointer" : "grab") : "";
        }
        return;
      }

      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      if (!chart || !series) return;
      const ts = chart.timeScale();
      const { x, y } = posOf(e);

      if (drag.hit.kind === "hline") {
        const price = series.coordinateToPrice(y);
        if (price !== null && isFinite(price)) {
          movePriceLineRef.current(drag.hit.id, price);
        }
        return;
      }

      const o = drag.orig as { t1: number; p1: number; t2: number; p2: number };
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const shifted = (t: number, p: number) => {
        const px = ts.timeToCoordinate(t as UTCTimestamp);
        const py = series.priceToCoordinate(p);
        if (px === null || py === null) return null;
        const nt = ts.coordinateToTime(px + dx);
        const np = series.coordinateToPrice(py + dy);
        if (nt === null || np === null || !isFinite(np)) return null;
        return { t: Number(nt), p: np };
      };

      if (drag.hit.part === "p1") {
        const n = shifted(o.t1, o.p1);
        if (n) moveTrendLineRef.current(drag.hit.id, { t1: n.t, p1: n.p });
      } else if (drag.hit.part === "p2") {
        const n = shifted(o.t2, o.p2);
        if (n) moveTrendLineRef.current(drag.hit.id, { t2: n.t, p2: n.p });
      } else {
        const n1 = shifted(o.t1, o.p1);
        const n2 = shifted(o.t2, o.p2);
        if (n1 && n2) {
          moveTrendLineRef.current(drag.hit.id, {
            t1: n1.t,
            p1: n1.p,
            t2: n2.t,
            p2: n2.p,
          });
        }
      }
    };

    const onUp = () => {
      if (drag) {
        drag = null;
        el.style.cursor = "";
      }
    };

    el.addEventListener("mousedown", onDown, true);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape cancels whatever is being drawn and returns to the cursor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMeasure(INITIAL_MEASURE);
      setTrendDraft(INITIAL_MEASURE);
      if (toolRef.current !== "cursor") setToolRef.current("cursor");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Double-click an oscillator pane (RSI, Stoch, …) to blow it up big, and
  // double-click again to restore — the intuitive companion to the ⛶ pill button.
  useEffect(() => {
    const el = containerRef.current;
    const chart = chartRef.current;
    if (!el || !chart) return;

    const onDbl = (e: MouseEvent) => {
      if (toolRef.current !== "cursor") return; // don't fight the drawing tools
      const r = el.getBoundingClientRect();
      const y = e.clientY - r.top;

      // Which stacked pane holds the click?
      const panes = chart.panes();
      let top = 0;
      let idx = -1;
      for (let i = 0; i < panes.length; i++) {
        const h = panes[i].getHeight();
        if (y >= top && y < top + h) {
          idx = i;
          break;
        }
        top += h;
      }
      if (idx <= 0) return; // pane 0 is the price chart — leave it alone

      // Map the pane index to its indicator, mirroring the create order.
      const ind = indicatorsRef.current;
      const rsiI = 1;
      const macdI = ind.rsi ? 2 : 1;
      const stochI = 1 + (ind.rsi ? 1 : 0) + (ind.macd ? 1 : 0);
      const srsiI = stochI + (ind.stoch ? 1 : 0);
      const wtI = srsiI + (ind.stochrsi ? 1 : 0);
      const cipherI = wtI + (ind.wavetrend ? 1 : 0);

      let key: IndicatorKey | null = null;
      if (ind.rsi && idx === rsiI) key = "rsi";
      else if (ind.macd && idx === macdI) key = "macd";
      else if (ind.stoch && idx === stochI) key = "stoch";
      else if (ind.stochrsi && idx === srsiI) key = "stochrsi";
      else if (ind.wavetrend && idx === wtI) key = "wavetrend";
      else if (ind.cipher && idx === cipherI) key = "cipher";
      if (key) toggleMaximizedPaneRef.current(key);
    };

    el.addEventListener("dblclick", onDbl);
    return () => el.removeEventListener("dblclick", onDbl);
  }, []);

  // Paint the symbol's trend lines (plus the one being placed, dashed)
  useEffect(() => {
    const prim = trendSegRef.current;
    if (!prim) return;
    const segs: Segment[] = trendLines
      .filter((t) => t.symbol === symbol)
      .map((t) => ({
        t1: t.t1 as UTCTimestamp,
        v1: t.p1,
        t2: t.t2 as UTCTimestamp,
        v2: t.p2,
        color: TV_COLORS.blue,
      }));
    if (trendDraft.phase === "placing" && trendDraft.a && trendDraft.b) {
      segs.push({
        t1: trendDraft.a.time as UTCTimestamp,
        v1: trendDraft.a.price,
        t2: trendDraft.b.time as UTCTimestamp,
        v2: trendDraft.b.price,
        color: TV_COLORS.blue,
        dashed: true,
      });
    }
    prim.setSegments(segs, segs.length > 0);
  }, [trendLines, symbol, trendDraft]);

  /**
   * Recolor every volume bar by its relative volume (bar ÷ 21-bar average),
   * redraw the average line, and report the latest reading for the pill so the
   * user can tell strong volume from weak at a glance.
   */
  function updateVolume() {
    const c = candlesRef.current;
    const series = volumeSeriesRef.current;
    if (!series || c.length === 0) return;
    const period = VOL_MA_PERIOD;

    // Rolling average at every bar; early bars use however many exist so the
    // relative read is still meaningful before a full window is available.
    const maAt = new Array<number>(c.length);
    let sum = 0;
    for (let i = 0; i < c.length; i++) {
      sum += c[i].volume;
      if (i >= period) sum -= c[i - period].volume;
      maAt[i] = sum / Math.min(i + 1, period);
    }

    series.setData(
      c.map((k, i) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: volBarColor(k.close >= k.open, maAt[i] > 0 ? k.volume / maAt[i] : 1),
      })),
    );

    if (volumeMaRef.current) {
      const line: { time: UTCTimestamp; value: number }[] = [];
      for (let i = period - 1; i < c.length; i++) {
        line.push({ time: c[i].time as UTCTimestamp, value: maAt[i] });
      }
      volumeMaRef.current.setData(line);
    }

    const lastMa = maAt[c.length - 1];
    const lastVol = c[c.length - 1].volume;
    setLastValues((prev) => ({
      ...prev,
      volume: lastVol,
      volRvol: lastMa > 0 ? lastVol / lastMa : 1,
    }));
  }

  function updateEMAs() {
    const c = candlesRef.current;
    if (c.length === 0) return;
    const cfg = configRef.current;
    let last20: number | undefined;
    let last50: number | undefined;
    let last200: number | undefined;

    if (ema20Ref.current) {
      const data = ema(c, cfg.ema20);
      ema20Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last20 = data.at(-1)?.value;
    }
    if (ema50Ref.current) {
      const data = ema(c, cfg.ema50);
      ema50Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last50 = data.at(-1)?.value;
    }
    if (ema200Ref.current) {
      const data = ema(c, cfg.ema200);
      ema200Ref.current.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      last200 = data.at(-1)?.value;
    }
    const lastVol = c.at(-1)?.volume;
    setLastValues((prev) => ({
      ...prev,
      ema20: last20,
      ema50: last50,
      ema200: last200,
      volume: lastVol,
    }));
  }

  function updateRibbon() {
    const c = candlesRef.current;
    if (c.length === 0 || ribbonRefs.current.length === 0) return;
    const cfg = configRef.current;
    const lines = cfg.ribbonLines;

    // Compute every line once — reused for the series, the pill and the fill.
    const series = lines.map((line) => ema(c, line.period));
    series.forEach((data, i) => {
      ribbonRefs.current[i]?.setData(
        data.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
    });

    setLastValues((prev) => ({
      ...prev,
      ribbon: lines.map((line, i) =>
        line.enabled ? series[i].at(-1)?.value : undefined,
      ),
    }));

    updateRibbonFill(lines, series);
  }

  /** Shade between the fastest and slowest *enabled* EMA. */
  function updateRibbonFill(
    lines: RibbonLine[],
    series: { time: number; value: number }[][],
  ) {
    const fill = ribbonFillRef.current;
    if (!fill) return;

    const cfg = configRef.current;
    // An EMA whose period exceeds the loaded candle count yields no points.
    // Span the band across the enabled EMAs that actually have data, so a too-slow
    // line degrades the fill instead of erasing it.
    const enabled = lines
      .map((line, i) => ({ line, data: series[i] }))
      .filter((x) => x.line.enabled && x.data.length > 0);

    const show =
      ribbonVisibleRef.current && cfg.ribbonFill && enabled.length >= 2;
    if (!show) {
      fill.setRegions([], false);
      return;
    }

    const fast = enabled[0];
    const slow = enabled[enabled.length - 1];

    // The slower EMA starts later, so align on time rather than index.
    const slowByTime = new Map(slow.data.map((p) => [p.time, p.value]));
    const bands: FillBand[] = [];
    for (const p of fast.data) {
      const slowValue = slowByTime.get(p.time);
      if (slowValue === undefined) continue;
      bands.push({
        time: p.time as UTCTimestamp,
        top: Math.max(p.value, slowValue),
        bottom: Math.min(p.value, slowValue),
      });
    }

    fill.setRegions(
      [{ bands, color: hexToRgba(fast.line.color, cfg.ribbonFillOpacity) }],
      true,
    );
  }

  function updateRSI() {
    const c = candlesRef.current;
    if (c.length === 0 || !rsiRef.current) return;
    const cfg = configRef.current;
    const points = rsi(c, cfg.rsi);
    const data = points.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));
    rsiRef.current.applyOptions({ color: cfg.rsiColor });
    rsiRef.current.setData(data);
    updateRSIDivergences(c, points);

    if (rsiMaRef.current) {
      const ma = cfg.rsiMa ? smoothSMA(points, cfg.rsiMaPeriod) : [];
      rsiMaRef.current.applyOptions({ color: cfg.rsiMaColor });
      rsiMaRef.current.setData(
        ma.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
    }

    updateRSIZones(data);

    if (data.length > 0) {
      const guide = (series: ISeriesApi<"Line"> | null, level: number) =>
        series?.setData([
          { time: data[0].time, value: level },
          { time: data[data.length - 1].time, value: level },
        ]);
      guide(rsi30Ref.current, 30);
      guide(rsi50Ref.current, 50);
      guide(rsi70Ref.current, 70);
    }
    setLastValues((prev) => ({ ...prev, rsi: data.at(-1)?.value }));
  }

  /**
   * RSI background like Matt's pane: red zone above 70, purple 30–70, green
   * below 30 — plus a stronger fill between the RSI line and the band edge
   * while it's overbought/oversold, so the extremes pop.
   */
  function updateRSIZones(data: { time: UTCTimestamp; value: number }[]) {
    const fill = rsiFillRef.current;
    if (!fill) return;
    if (hiddenRef.current.rsi || data.length < 2) {
      fill.setRegions([], false);
      return;
    }

    const first = data[0].time;
    const last = data[data.length - 1].time;
    const zone = (top: number, bottom: number, color: string, opacity: number) => ({
      bands: [
        { time: first, top, bottom },
        { time: last, top, bottom },
      ],
      color: hexToRgba(color, opacity),
    });

    // Fill collapses to zero height where the RSI is inside the band, so a
    // single region per side renders only the overbought / oversold stretches.
    const overbought: FillBand[] = data.map((p) => ({
      time: p.time,
      top: Math.max(p.value, 70),
      bottom: 70,
    }));
    const oversold: FillBand[] = data.map((p) => ({
      time: p.time,
      top: 30,
      bottom: Math.min(p.value, 30),
    }));

    // Zones exactly as Matt's pane: red only at the 85–100 extreme, purple
    // through the 30–70 middle, green only at the 0–15 extreme.
    fill.setRegions(
      [
        zone(100, 85, RSI_COLORS.bear, 10),
        zone(70, 30, RSI_COLORS.band, 10),
        zone(15, 0, RSI_COLORS.bull, 10),
        { bands: overbought, color: hexToRgba(RSI_COLORS.bear, 30) },
        { bands: oversold, color: hexToRgba(RSI_COLORS.bull, 30) },
      ],
      true,
    );
  }

  /**
   * Red/green divergence lines from pivot to pivot on the RSI, like Matt's pane.
   * Clean look — no arrows or text labels, just the connecting lines.
   */
  function updateRSIDivergences(
    c: Candle[],
    points: { time: number; value: number }[],
  ) {
    if (!rsiRef.current) return;
    const cfg = configRef.current;

    if (!cfg.rsiDiv || hiddenRef.current.rsi) {
      rsiSegRef.current?.setSegments([], false);
      return;
    }

    // Hidden divergences dashed so continuation vs. reversal reads at a glance.
    const divs = rsiDivergences(c, points, cfg.rsiDivLeft, cfg.rsiDivRight);
    const segments: Segment[] = divs.map((d) => {
      const bullish = d.kind === "bull" || d.kind === "hidden_bull";
      return {
        t1: d.prevTime as UTCTimestamp,
        v1: d.prevValue,
        t2: d.time as UTCTimestamp,
        v2: d.value,
        color: bullish ? RSI_COLORS.bull : RSI_COLORS.bear,
        dashed: d.kind === "hidden_bull" || d.kind === "hidden_bear",
      };
    });
    rsiSegRef.current?.setSegments(segments, true);
  }

  /** Dashed verticals at the New York open and ±`sessionOffsetMin` around it. */
  function updateSessionLines() {
    const prim = sessionRef.current;
    if (!prim) return;
    const cfg = configRef.current;
    if (!sessionVisibleRef.current) {
      sessionKeyRef.current = "";
      prim.setLines([], false);
      return;
    }

    // The lines only move when the loaded day range changes, so skip the (Intl-heavy)
    // recompute on every live tick.
    const c = candlesRef.current;
    const first = c[0]?.time ?? 0;
    const last = c[c.length - 1]?.time ?? 0;
    const key = `${Math.floor(first / 86_400)}:${Math.floor(last / 86_400)}:${cfg.sessionOffsetMin}`;
    if (key === sessionKeyRef.current) return;
    sessionKeyRef.current = key;

    prim.setLines(sessionLines(c, cfg.sessionOffsetMin, SESSION_COLORS), true);
  }

  function updateMACD() {
    const c = candlesRef.current;
    if (c.length === 0 || !macdRef.current) return;
    const cfg = configRef.current;
    const m = macd(c, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
    macdRef.current.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.macd })),
    );
    macdSignalRef.current?.setData(
      m.map((p) => ({ time: p.time as UTCTimestamp, value: p.signal })),
    );
    macdHistRef.current?.setData(
      m.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.histogram,
        color: p.histogram >= 0 ? `${TV_COLORS.green}80` : `${TV_COLORS.red}80`,
      })),
    );
    const last = m.at(-1);
    setLastValues((prev) => ({
      ...prev,
      macd: last?.macd,
      macdSignal: last?.signal,
      macdHist: last?.histogram,
    }));
  }

  function updateBB() {
    const c = candlesRef.current;
    if (c.length === 0 || !bbUpperRef.current) return;
    const cfg = configRef.current;
    const data = bollingerBands(c, cfg.bbPeriod, cfg.bbStdDev);
    bbUpperRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.upper })),
    );
    bbMiddleRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.middle })),
    );
    bbLowerRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.lower })),
    );
    const last = data.at(-1);
    setLastValues((prev) => ({
      ...prev,
      bbUpper: last?.upper,
      bbMiddle: last?.middle,
      bbLower: last?.lower,
    }));
  }

  function updateStoch() {
    const c = candlesRef.current;
    if (c.length === 0 || !stochKRef.current) return;
    const cfg = configRef.current;
    const data = stochastic(c, cfg.stochK, cfg.stochD, cfg.stochSmooth);
    stochKRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.k })),
    );
    stochDRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.d })),
    );
    if (stoch20Ref.current && data.length > 0) {
      stoch20Ref.current.setData([
        { time: data[0].time as UTCTimestamp, value: 20 },
        { time: data[data.length - 1].time as UTCTimestamp, value: 20 },
      ]);
    }
    if (stoch80Ref.current && data.length > 0) {
      stoch80Ref.current.setData([
        { time: data[0].time as UTCTimestamp, value: 80 },
        { time: data[data.length - 1].time as UTCTimestamp, value: 80 },
      ]);
    }
    updateOscillatorZone(
      stochFillRef.current,
      data,
      indicatorsVisibleRef.current.stoch,
    );
    const last = data.at(-1);
    setLastValues((prev) => ({ ...prev, stochK: last?.k, stochD: last?.d }));
  }

  /** Soft background zone behind a 0–100 oscillator, TradingView-style. */
  function updateOscillatorZone(
    fill: BandFillPrimitive | null,
    data: { time: number }[],
    visible: boolean,
    top = 80,
    bottom = 20,
    color: string = STOCH_COLORS.band,
  ) {
    if (!fill) return;
    if (!visible || data.length < 2) {
      fill.setRegions([], false);
      return;
    }
    fill.setRegions(
      [
        {
          bands: [
            { time: data[0].time as UTCTimestamp, top, bottom },
            { time: data[data.length - 1].time as UTCTimestamp, top, bottom },
          ],
          color: hexToRgba(color, 10),
        },
      ],
      true,
    );
  }

  function updateStochRsi() {
    const c = candlesRef.current;
    if (c.length === 0 || !srsiKRef.current) return;
    const cfg = configRef.current;
    const data = stochRsi(c, cfg.srsiRsiLen, cfg.srsiStochLen, cfg.srsiK, cfg.srsiD);
    srsiKRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.k })),
    );
    srsiDRef.current?.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.d })),
    );
    if (srsi20Ref.current && data.length > 0) {
      srsi20Ref.current.setData([
        { time: data[0].time as UTCTimestamp, value: 20 },
        { time: data[data.length - 1].time as UTCTimestamp, value: 20 },
      ]);
    }
    if (srsi80Ref.current && data.length > 0) {
      srsi80Ref.current.setData([
        { time: data[0].time as UTCTimestamp, value: 80 },
        { time: data[data.length - 1].time as UTCTimestamp, value: 80 },
      ]);
    }
    updateOscillatorZone(
      srsiFillRef.current,
      data,
      indicatorsVisibleRef.current.stochrsi,
    );
    const last = data.at(-1);
    setLastValues((prev) => ({ ...prev, srsiK: last?.k, srsiD: last?.d }));
  }

  function updateSuperTrend() {
    const c = candlesRef.current;
    if (c.length === 0 || !stBullRef.current) return;
    const cfg = configRef.current;
    const data = superTrend(c, cfg.stPeriod, cfg.stMultiplier);
    const bull = data
      .filter((p) => p.direction === 1)
      .map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    const bear = data
      .filter((p) => p.direction === -1)
      .map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    stBullRef.current.setData(bull);
    stBearRef.current?.setData(bear);
    const last = data.at(-1);
    setLastValues((prev) => ({
      ...prev,
      supertrend: last?.value,
      supertrendDir: last?.direction,
    }));
  }

  function updateVWAP() {
    const c = candlesRef.current;
    if (c.length === 0 || !vwapRef.current) return;
    const cfg = configRef.current;
    const data = vwap(c);

    vwapRef.current.setData(
      data.map((p) => ({ time: p.time as UTCTimestamp, value: p.vwap })),
    );

    // Bands: refs are laid out [upper #1, lower #1, upper #2, lower #2, …],
    // matching the order of the enabled multipliers.
    const bands = activeVwapBands(cfg);
    const last = data.at(-1);
    bands.forEach((band, k) => {
      const upper = vwapBandRefs.current[k * 2];
      const lower = vwapBandRefs.current[k * 2 + 1];
      upper?.setData(
        data.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.vwap + band.multiplier * p.sd,
        })),
      );
      lower?.setData(
        data.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.vwap - band.multiplier * p.sd,
        })),
      );
      if (last) {
        setEndDot(upper, last.time, band.color);
        setEndDot(lower, last.time, band.color);
      }
    });
    if (last) setEndDot(vwapRef.current, last.time, cfg.vwapColor);

    updateVWAPFill(data, bands.map((b) => b.multiplier));
    setLastValues((prev) => ({ ...prev, vwapVal: last?.vwap }));
  }

  /** Round dot on the last bar of a line, like the ones CdeCripto puts on each level. */
  function setEndDot(
    series: ISeriesApi<"Line"> | null | undefined,
    time: number,
    color: string,
  ) {
    if (!series) return;
    let api = vwapDotRefs.current.get(series);
    if (!api) {
      api = createSeriesMarkers(series, []);
      vwapDotRefs.current.set(series, api);
    }
    api.setMarkers([
      {
        time: time as UTCTimestamp,
        position: "inBar",
        shape: "circle",
        color,
        size: 1,
      },
    ]);
  }

  /** Shade each consecutive VWAP band (vwap→#1, #1→#2, …) above and below. */
  function updateVWAPFill(
    data: { time: number; vwap: number; sd: number }[],
    mults: number[],
  ) {
    const fill = vwapFillRef.current;
    if (!fill) return;

    const cfg = configRef.current;
    const count = mults.length;
    const show = vwapVisibleRef.current && cfg.vwapFill && count >= 1;
    if (!show) {
      fill.setRegions([], false);
      return;
    }

    const color = hexToRgba(cfg.vwapFillColor, cfg.vwapFillOpacity);
    const regions: FillRegion[] = [];

    // Multiplier levels including the center line (0) as the innermost edge.
    const levels = [0, ...mults];
    for (let k = 0; k < count; k++) {
      const inner = levels[k];
      const outer = levels[k + 1];
      const upper: FillBand[] = [];
      const lower: FillBand[] = [];
      for (const p of data) {
        const t = p.time as UTCTimestamp;
        upper.push({ time: t, top: p.vwap + outer * p.sd, bottom: p.vwap + inner * p.sd });
        lower.push({ time: t, top: p.vwap - inner * p.sd, bottom: p.vwap - outer * p.sd });
      }
      regions.push({ bands: upper, color }, { bands: lower, color });
    }

    fill.setRegions(regions, true);
  }

  function updateIchimoku() {
    const c = candlesRef.current;
    if (c.length === 0 || !ichiTenkanRef.current) return;
    const cfg = configRef.current;
    const d = ichimoku(
      c,
      cfg.ichiTenkan,
      cfg.ichiKijun,
      cfg.ichiSenkouB,
      cfg.ichiDisplacement,
    );

    const line = (pts: { time: number; value: number }[]) =>
      pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));

    ichiTenkanRef.current.setData(line(d.tenkan));
    ichiKijunRef.current?.setData(line(d.kijun));
    ichiSpanARef.current?.setData(line(d.senkouA));
    ichiSpanBRef.current?.setData(line(d.senkouB));
    ichiChikouRef.current?.setData(line(d.chikou));

    updateIchimokuCloud(d.senkouA, d.senkouB);

    const lastA = d.senkouA.at(-1)?.value;
    const lastB = d.senkouB.at(-1)?.value;
    setLastValues((prev) => ({
      ...prev,
      ichiBias:
        lastA !== undefined && lastB !== undefined
          ? lastA >= lastB
            ? "Alcista"
            : "Bajista"
          : undefined,
    }));
  }

  /**
   * Shade the Kumo between Senkou A and B, split into contiguous green (A≥B)
   * and red (A<B) runs so the cloud flips color on each crossover like TradingView.
   */
  function updateIchimokuCloud(
    spanA: { time: number; value: number }[],
    spanB: { time: number; value: number }[],
  ) {
    const cloud = ichiCloudRef.current;
    if (!cloud) return;
    if (!ichiVisibleRef.current || spanA.length < 2 || spanB.length < 2) {
      cloud.setRegions([], false);
      return;
    }

    const bByTime = new Map(spanB.map((p) => [p.time, p.value]));
    const up = hexToRgba(ICHIMOKU_COLORS.cloudUp, 12);
    const down = hexToRgba(ICHIMOKU_COLORS.cloudDown, 12);

    const regions: FillRegion[] = [];
    let current: FillBand[] = [];
    let currentUp: boolean | null = null;

    const flush = () => {
      if (current.length >= 2) {
        regions.push({ bands: current, color: currentUp ? up : down });
      }
      current = [];
    };

    for (const a of spanA) {
      const b = bByTime.get(a.time);
      if (b === undefined) continue;
      const isUp = a.value >= b;
      if (currentUp === null) currentUp = isUp;
      if (isUp !== currentUp) {
        // Carry the crossover point into both segments so they meet with no gap.
        const boundary: FillBand = {
          time: a.time as UTCTimestamp,
          top: Math.max(a.value, b),
          bottom: Math.min(a.value, b),
        };
        current.push(boundary);
        flush();
        currentUp = isUp;
        current.push(boundary);
      }
      current.push({
        time: a.time as UTCTimestamp,
        top: Math.max(a.value, b),
        bottom: Math.min(a.value, b),
      });
    }
    flush();

    cloud.setRegions(regions, true);
  }

  function updateWaveTrend() {
    const c = candlesRef.current;
    if (c.length === 0 || !wt1Ref.current) return;
    const cfg = configRef.current;
    const data = waveTrend(c, cfg.wtChannel, cfg.wtAvg, cfg.wtSignal);
    wt1Ref.current.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.wt1 })));
    wt2Ref.current?.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.wt2 })));
    if (wt0Ref.current && data.length > 0) {
      wt0Ref.current.setData([
        { time: data[0].time as UTCTimestamp, value: 0 },
        { time: data[data.length - 1].time as UTCTimestamp, value: 0 },
      ]);
    }
    const last = data.at(-1);
    setLastValues((prev) => ({ ...prev, wt1: last?.wt1, wt2: last?.wt2 }));
  }

  /** Marker shape/color/size per Cipher B signal, matching the script. */
  const CIPHER_MARKER: Record<
    CipherSignalKind,
    { color: string; position: "aboveBar" | "belowBar" | "inBar"; size: number }
  > = {
    buy: { color: CIPHER_COLORS.buy, position: "belowBar", size: 2 },
    sell: { color: CIPHER_COLORS.sell, position: "aboveBar", size: 2 },
    gold: { color: CIPHER_COLORS.gold, position: "belowBar", size: 2 },
    crossUp: { color: CIPHER_COLORS.buy, position: "inBar", size: 0 },
    crossDown: { color: CIPHER_COLORS.sell, position: "inBar", size: 0 },
    bullDiv: { color: CIPHER_COLORS.bullDiv, position: "belowBar", size: 1 },
    bearDiv: { color: CIPHER_COLORS.bearDiv, position: "aboveBar", size: 1 },
  };

  function updateCipher() {
    const c = candlesRef.current;
    if (c.length === 0 || !cipherWt2Ref.current) return;
    const { points, signals } = cipherB(c, CIPHER_DEFAULTS);
    if (points.length === 0) return;

    const at = (sel: (p: (typeof points)[number]) => number) =>
      points.map((p) => ({ time: p.time as UTCTimestamp, value: sel(p) }));

    cipherWt2Ref.current.setData(at((p) => p.wt2));
    cipherWt1Ref.current?.setData(at((p) => p.wt1));
    cipherVwapRef.current?.setData(at((p) => p.vwap));
    cipherMfiRef.current?.setData(at((p) => p.rsiMfi));

    const first = points[0].time as UTCTimestamp;
    const lastT = points[points.length - 1].time as UTCTimestamp;
    cipher0Ref.current?.setData([
      { time: first, value: 0 },
      { time: lastT, value: 0 },
    ]);
    cipherObRef.current?.setData([
      { time: first, value: CIPHER_DEFAULTS.obLevel },
      { time: lastT, value: CIPHER_DEFAULTS.obLevel },
    ]);
    cipherOsRef.current?.setData([
      { time: first, value: CIPHER_DEFAULTS.osLevel },
      { time: lastT, value: CIPHER_DEFAULTS.osLevel },
    ]);

    // One marker per bar: keep the highest-priority signal so they don't stack.
    const priority: CipherSignalKind[] = [
      "gold",
      "buy",
      "sell",
      "bullDiv",
      "bearDiv",
      "crossUp",
      "crossDown",
    ];
    const best = new Map<number, CipherSignalKind>();
    for (const s of signals) {
      const cur = best.get(s.time);
      if (!cur || priority.indexOf(s.kind) < priority.indexOf(cur)) {
        best.set(s.time, s.kind);
      }
    }
    const markers: SeriesMarker<Time>[] = [...best.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, kind]) => {
        const m = CIPHER_MARKER[kind];
        return {
          time: time as UTCTimestamp,
          position: m.position,
          shape: "circle" as const,
          color: m.color,
          size: m.size,
        };
      });
    cipherMarkersRef.current?.setMarkers(markers);

    const last = points[points.length - 1];
    setLastValues((prev) => ({ ...prev, cipherWt1: last.wt1, cipherWt2: last.wt2 }));
  }

  /** Push `candlesRef` into every series — candles, volume and all indicators. */
  function redrawAll() {
    const klines = candlesRef.current;
    candleSeriesRef.current?.setData(
      klines.map((k) => ({
        time: k.time as UTCTimestamp,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      })),
    );
    updateEMAs();
    updateVolume();
    updateRibbon();
    updateRSI();
    updateMACD();
    updateBB();
    updateStoch();
    updateStochRsi();
    updateSuperTrend();
    updateVWAP();
    updateWaveTrend();
    updateCipher();
    updateIchimoku();
    updateSessionLines();
  }

  // Load historical data + subscribe live
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    // Paging state for older candles — reset on every symbol/timeframe switch.
    let fetchingOlder = false;
    let exhausted = false;

    /**
     * Prepend the page of candles that precedes the oldest one loaded, so panning
     * left keeps going instead of stopping at the initial 1000-bar window.
     */
    async function loadOlder() {
      const oldest = candlesRef.current[0];
      if (
        cancelled ||
        fetchingOlder ||
        exhausted ||
        !oldest ||
        candlesRef.current.length >= MAX_CANDLES
      ) {
        return;
      }
      fetchingOlder = true;
      setLoadingHistory(true);
      try {
        const endTime = oldest.time * 1000 - 1;
        const page = await fetchCandles(exchange, symbol, timeframe, PAGE_SIZE, endTime);
        if (cancelled) return;

        const older = page.filter((c) => c.time < oldest.time);
        if (older.length === 0) {
          exhausted = true; // reached the listing date
          return;
        }

        // setData reindexes the bars, so the view would jump back by however many
        // we prepended. Shift the logical range by the same amount to hold it still.
        const ts = chartRef.current?.timeScale();
        const before = ts?.getVisibleLogicalRange();
        candlesRef.current = [...older, ...candlesRef.current];
        redrawAll();
        if (ts && before) {
          ts.setVisibleLogicalRange({
            from: before.from + older.length,
            to: before.to + older.length,
          });
        }
      } catch (e) {
        console.error("Failed to load older candles:", e);
      } finally {
        fetchingOlder = false;
        if (!cancelled) setLoadingHistory(false);
      }
    }

    loadMoreRef.current = () => void loadOlder();

    // ——— Keep-alive ———
    // The chart must never freeze: Bitget has no kline WebSocket, Binance's WS
    // can die silently, tabs get put to sleep, and the initial fetch can fail.
    // `lastTick` tracks the last live update; a watchdog resyncs over REST
    // whenever the data goes stale, the tab wakes up, or the network returns.
    let lastTick = Date.now();
    let resyncing = false;

    /**
     * Refetch recent candles and splice them over the loaded tail.
     * `deep` pulls a big window (wake-from-sleep / initial-failure recovery);
     * routine live polls stay light so a 1s Bitget cadence isn't heavy.
     */
    async function resync(deep = false) {
      if (cancelled || resyncing || fetchingOlder) return;
      resyncing = true;
      try {
        const fresh = await fetchCandles(exchange, symbol, timeframe, deep ? 500 : 90);
        if (cancelled || fresh.length === 0) return;

        const hadData = candlesRef.current.length > 0;
        const firstFresh = fresh[0].time;
        const keep = candlesRef.current.filter((c) => c.time < firstFresh);
        candlesRef.current = [...keep, ...fresh];
        redrawAll();
        if (!hadData) {
          // The initial load must have failed — treat this as it
          chartRef.current?.timeScale().fitContent();
          requestAnimationFrame(() => recomputePaneOffsets());
        }

        const last = fresh[fresh.length - 1];
        const prev = fresh[fresh.length - 2] ?? last;
        setLastPrice({
          value: last.close,
          pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
        });
        lastTick = Date.now();
      } catch (e) {
        console.error("Resync failed:", e);
      } finally {
        resyncing = false;
      }
    }

    // Bitget is REST-only, so "live" means polling every few seconds. For the
    // Binance venues the WS is primary and this only fires if it goes quiet.
    // Bitget has no kline WebSocket, so poll it hard (~1s) to keep the chart
    // live. Binance streams over WS, so its watchdog only fires if the socket
    // goes silent.
    const STALE_MS = exchange === "bitget" ? 1_000 : 20_000;
    const watchdog = setInterval(() => {
      if (document.hidden) return; // don't burn requests in background tabs
      if (Date.now() - lastTick > STALE_MS) void resync();
    }, exchange === "bitget" ? 1_000 : 8_000);

    // Waking the tab or regaining network = deep catch-up to fill any gap.
    const onWake = () => {
      if (!document.hidden) void resync(true);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    async function load(attempt = 0) {
      try {
        const klines = await fetchCandles(exchange, symbol, timeframe, PAGE_SIZE);
        if (cancelled) return;
        candlesRef.current = klines;
        redrawAll();
        chartRef.current?.timeScale().fitContent();
        requestAnimationFrame(() => recomputePaneOffsets());
        lastTick = Date.now();

        if (klines.length > 0) {
          const last = klines[klines.length - 1];
          const prev = klines[klines.length - 2] ?? last;
          setLastPrice({
            value: last.close,
            pct: prev.close === 0 ? 0 : ((last.close - prev.close) / prev.close) * 100,
          });
        }

        // Live candles via WebSocket — spot and futures share the protocol;
        // Bitget has no public multiplexed kline stream, so it polls (above).
        if (exchange === "bitget") return;
        const ws = exchange === "binancef" ? getBinanceFuturesWS() : getBinanceWS();
        const handleCandle = (k: Candle) => {
            if (!candleSeriesRef.current) return;
            lastTick = Date.now(); // the stream is alive — hold the watchdog off
            const arr = candlesRef.current;
            const lastCandle = arr[arr.length - 1];
            if (lastCandle && lastCandle.time === k.time) {
              arr[arr.length - 1] = k;
            } else if (!lastCandle || k.time > lastCandle.time) {
              arr.push(k);
              // Trim only past the paging cap — a smaller cap would silently drop
              // the history the user just scrolled back to load.
              if (arr.length > MAX_CANDLES) arr.shift();
            } else {
              return;
            }
            candleSeriesRef.current.update({
              time: k.time as UTCTimestamp,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
            });
            updateEMAs();
            updateVolume(); // recolors bars by relative volume, incl. the live one
            updateRibbon();
            updateRSI();
            updateMACD();
            updateBB();
            updateStoch();
            updateStochRsi();
            updateSuperTrend();
            updateVWAP();
            updateWaveTrend();
            updateCipher();
            updateIchimoku();
            updateSessionLines();
            const prev = arr[arr.length - 2] ?? lastCandle;
            setLastPrice({
              value: k.close,
              pct: prev && prev.close !== 0 ? ((k.close - prev.close) / prev.close) * 100 : 0,
            });
        };

        // 2m doesn't exist upstream: subscribe to the 1m stream and roll pairs
        // of minutes into the evolving 2m candle before the normal handling.
        const onCandle =
          timeframe === "2m"
            ? makeTwoMinuteAggregator(handleCandle, (bucket) => {
                const last = candlesRef.current[candlesRef.current.length - 1];
                return last && last.time === bucket ? { ...last } : undefined;
              })
            : handleCandle;

        unsub = ws.subscribeKline({
          symbol,
          interval: timeframe === "2m" ? "1m" : timeframe,
          onCandle,
        });
      } catch (e) {
        console.error("Failed to load chart data:", e);
        // Retry with backoff — a flaky connection must not leave a dead chart.
        // After the retries run out, the watchdog keeps trying via resync().
        if (!cancelled && attempt < 4) {
          setTimeout(() => {
            if (!cancelled) void load(attempt + 1);
          }, 1_500 * (attempt + 1));
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      loadMoreRef.current = null;
      setLoadingHistory(false);
      clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      if (unsub) unsub();
    };
  }, [symbol, timeframe, exchange]);

  const greenOrRed = (n: number) =>
    n >= 0 ? "text-tv-green" : "text-tv-red";

  // Helpers for pill rendering
  const isShown = (key: IndicatorKey) =>
    indicators[key] && (key === "volume" || true); // always renderable if enabled
  void isShown;

  const rsiPaneIdx = 1;
  const macdPaneIdx = indicators.rsi ? 2 : 1;
  const stochPaneIdx = 1 + (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0);
  const srsiPaneIdx = stochPaneIdx + (indicators.stoch ? 1 : 0);
  const wtPaneIdx = srsiPaneIdx + (indicators.stochrsi ? 1 : 0);
  const cipherPaneIdx = wtPaneIdx + (indicators.wavetrend ? 1 : 0);

  // Blow one oscillator pane up big (like maximizing a pane in TradingView) by
  // re-weighting the stretch factors; toggling back restores the 3:1 layout.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const paneIdxFor: Partial<Record<IndicatorKey, number>> = {
      rsi: rsiPaneIdx,
      macd: macdPaneIdx,
      stoch: stochPaneIdx,
      stochrsi: srsiPaneIdx,
      wavetrend: wtPaneIdx,
      cipher: cipherPaneIdx,
    };
    const maxIdx =
      maximizedPane && indicators[maximizedPane]
        ? paneIdxFor[maximizedPane]
        : undefined;
    try {
      chart.panes().forEach((p, i) => {
        if (maxIdx !== undefined) {
          p.setStretchFactor(i === maxIdx ? 6 : 1);
        } else {
          p.setStretchFactor(i === 0 ? 3 : 1);
        }
      });
    } catch {}
    requestAnimationFrame(() => recomputePaneOffsets());
  }, [
    maximizedPane,
    indicators.rsi,
    indicators.macd,
    indicators.stoch,
    indicators.stochrsi,
    indicators.wavetrend,
    indicators.cipher,
    rsiPaneIdx,
    macdPaneIdx,
    stochPaneIdx,
    srsiPaneIdx,
    wtPaneIdx,
    cipherPaneIdx,
  ]);

  let measureRender: React.ReactNode = null;
  if (
    measure.a &&
    measure.b &&
    chartRef.current &&
    candleSeriesRef.current
  ) {
    const ts = chartRef.current.timeScale();
    const aX = ts.timeToCoordinate(measure.a.time as UTCTimestamp);
    const bX = ts.timeToCoordinate(measure.b.time as UTCTimestamp);
    const aY = candleSeriesRef.current.priceToCoordinate(measure.a.price);
    const bY = candleSeriesRef.current.priceToCoordinate(measure.b.price);

    if (aX !== null && bX !== null && aY !== null && bY !== null) {
      const priceDiff = measure.b.price - measure.a.price;
      const pctChange =
        measure.a.price === 0 ? 0 : (priceDiff / measure.a.price) * 100;
      const isUp = priceDiff >= 0;
      const start = Math.min(measure.a.time, measure.b.time);
      const end = Math.max(measure.a.time, measure.b.time);
      const inRange = candlesRef.current.filter(
        (c) => c.time >= start && c.time <= end,
      );
      const bars = inRange.length;
      const volume = inRange.reduce((s, c) => s + c.volume, 0);
      const dur = durationLabel(measure.a.time, measure.b.time);

      measureRender = (
        <MeasureOverlay
          aX={aX}
          aY={aY}
          bX={bX}
          bY={bY}
          priceDiff={priceDiff}
          pctChange={pctChange}
          bars={bars}
          volume={volume}
          durationText={dur}
          isUp={isUp}
          isPreview={measure.phase === "placing"}
        />
      );
    }
  }
  void renderTick;

  // Ribbon bias: EMAs stacked fast→slow descending = uptrend, ascending = downtrend,
  // anything else means the EMAs are tangled (no clear trend). Disabled lines
  // report `undefined` and are excluded rather than breaking the read.
  const vwapMults = activeVwapBands(config).map((b) => b.multiplier);

  const ribbonBias = (() => {
    const v = (lastValues.ribbon ?? []).filter(
      (x): x is number => x !== undefined,
    );
    if (v.length < 2) return undefined;
    if (v.every((x, i) => i === 0 || v[i - 1] > x)) return "Alcista";
    if (v.every((x, i) => i === 0 || v[i - 1] < x)) return "Bajista";
    return "Rango";
  })();

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {measureRender}

      {loadingHistory && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded border border-tv-border bg-tv-panel/90 px-2 py-1 text-[11px] text-tv-text-muted shadow">
          Cargando histórico…
        </div>
      )}

      {/* Top-left of main pane: symbol info + OHLC + Volume pill + EMA pills */}
      <div
        style={{ top: (paneOffsets[0]?.top ?? 0) + 12, left: 12 }}
        className="pointer-events-none absolute z-10 flex flex-col gap-1 text-xs tabular-nums"
      >
        {/* Row 1: symbol info + OHLC stats inline on hover (fixed height, never wraps) */}
        <div className="flex h-5 flex-nowrap items-center gap-x-3 overflow-hidden whitespace-nowrap">
          <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">
            <span className="text-tv-text">{symbol}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="uppercase text-tv-text-muted">{timeframe}</span>
            <span className="text-tv-text-muted">·</span>
            <span className="text-tv-text-muted">{EXCHANGE_LABELS[exchange]}</span>
          </div>
          {hover && (
            <div className="flex items-center gap-x-3 text-[11px]">
              <span className="text-tv-text-muted">
                O <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.o)}</span>
              </span>
              <span className="text-tv-text-muted">
                H <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.h)}</span>
              </span>
              <span className="text-tv-text-muted">
                L <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.l)}</span>
              </span>
              <span className="text-tv-text-muted">
                C <span className={greenOrRed(hover.c - hover.o)}>{formatPrice(hover.c)}</span>
              </span>
              <span className={greenOrRed(hover.pct)}>
                {hover.pct >= 0 ? "+" : ""}
                {hover.pct.toFixed(2)}%
              </span>
              <span className="text-tv-text-muted">
                Vol <span className="text-tv-text">{formatVolume(hover.v)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Row 2: big live price (always present — reserves space even while loading) */}
        <div className="flex h-7 items-center gap-2">
          {lastPrice ? (
            <>
              <span className={`text-lg font-semibold tabular-nums ${greenOrRed(lastPrice.pct)}`}>
                {formatPrice(lastPrice.value)}
              </span>
              <span className={`text-xs ${greenOrRed(lastPrice.pct)}`}>
                {lastPrice.pct >= 0 ? "+" : ""}
                {lastPrice.pct.toFixed(2)}%
              </span>
            </>
          ) : (
            <span className="text-xs text-tv-text-muted">Cargando…</span>
          )}
        </div>

        {/* Indicator pills for the main pane (fixed position below price) */}
        <div className="mt-1 flex flex-col items-start gap-1">
          {indicators.ema20 && (
            <IndicatorPill
              name={`EMA ${config.ema20}`}
              value={lastValues.ema20 !== undefined ? formatPrice(lastValues.ema20) : undefined}
              color={INDICATOR_COLORS.ema20}
              hidden={hidden.ema20}
              onToggleHide={() => toggleHidden("ema20")}
              onSettings={() => setSettingsTarget("ema20")}
              onRemove={() => removeIndicator("ema20")}
            />
          )}
          {indicators.ema50 && (
            <IndicatorPill
              name={`EMA ${config.ema50}`}
              value={lastValues.ema50 !== undefined ? formatPrice(lastValues.ema50) : undefined}
              color={INDICATOR_COLORS.ema50}
              hidden={hidden.ema50}
              onToggleHide={() => toggleHidden("ema50")}
              onSettings={() => setSettingsTarget("ema50")}
              onRemove={() => removeIndicator("ema50")}
            />
          )}
          {indicators.ema200 && (
            <IndicatorPill
              name={`EMA ${config.ema200}`}
              value={lastValues.ema200 !== undefined ? formatPrice(lastValues.ema200) : undefined}
              color={INDICATOR_COLORS.ema200}
              hidden={hidden.ema200}
              onToggleHide={() => toggleHidden("ema200")}
              onSettings={() => setSettingsTarget("ema200")}
              onRemove={() => removeIndicator("ema200")}
            />
          )}
          {indicators.ribbon && (
            <IndicatorPill
              name={`Cinta EMAs ${config.ribbonLines
                .filter((l) => l.enabled)
                .map((l) => l.period)
                .join("/")}`}
              value={ribbonBias}
              color={config.ribbonLines.find((l) => l.enabled)?.color ?? INDICATOR_COLORS.ribbon}
              hidden={hidden.ribbon}
              onToggleHide={() => toggleHidden("ribbon")}
              onSettings={() => setSettingsTarget("ribbon")}
              onRemove={() => removeIndicator("ribbon")}
            />
          )}
          {indicators.volume && (
            <IndicatorPill
              name="Vol"
              value={
                lastValues.volume !== undefined
                  ? `${formatVolume(lastValues.volume)} · ${(lastValues.volRvol ?? 1).toFixed(1)}x ${volStateLabel(lastValues.volRvol ?? 1)}`
                  : undefined
              }
              color={
                lastValues.volRvol !== undefined && lastValues.volRvol >= 1.2
                  ? TV_COLORS.green
                  : lastValues.volRvol !== undefined && lastValues.volRvol < 0.7
                    ? TV_COLORS.textMuted
                    : INDICATOR_COLORS.volume
              }
              hidden={hidden.volume}
              onToggleHide={() => toggleHidden("volume")}
              onSettings={() => setSettingsTarget("volume")}
              onRemove={() => removeIndicator("volume")}
            />
          )}
          {indicators.bb && (
            <IndicatorPill
              name={`BB ${config.bbPeriod}, ${config.bbStdDev}`}
              value={lastValues.bbMiddle !== undefined ? formatPrice(lastValues.bbMiddle) : undefined}
              color={INDICATOR_COLORS.bb}
              hidden={hidden.bb}
              onToggleHide={() => toggleHidden("bb")}
              onSettings={() => setSettingsTarget("bb")}
              onRemove={() => removeIndicator("bb")}
            />
          )}
          {indicators.supertrend && (
            <IndicatorPill
              name={`ST ${config.stPeriod}, ${config.stMultiplier}`}
              value={
                lastValues.supertrend !== undefined
                  ? `${formatPrice(lastValues.supertrend)} ${lastValues.supertrendDir === 1 ? "▲" : "▼"}`
                  : undefined
              }
              color={lastValues.supertrendDir === 1 ? INDICATOR_COLORS.supertrend : "#ef5350"}
              hidden={hidden.supertrend}
              onToggleHide={() => toggleHidden("supertrend")}
              onSettings={() => setSettingsTarget("supertrend")}
              onRemove={() => removeIndicator("supertrend")}
            />
          )}
          {indicators.vwap && (
            <IndicatorPill
              name={
                vwapMults.length > 0
                  ? `VWAP ±${vwapMults.join("/")}σ`
                  : "VWAP"
              }
              value={lastValues.vwapVal !== undefined ? formatPrice(lastValues.vwapVal) : undefined}
              color={config.vwapColor}
              hidden={hidden.vwap}
              onToggleHide={() => toggleHidden("vwap")}
              onSettings={() => setSettingsTarget("vwap")}
              onRemove={() => removeIndicator("vwap")}
            />
          )}
          {indicators.session && (
            <IndicatorPill
              name="Sesión NY"
              value={`OPEN ±${offsetLabel(config.sessionOffsetMin)}`}
              color={SESSION_COLORS.open}
              hidden={hidden.session}
              onToggleHide={() => toggleHidden("session")}
              onSettings={() => setSettingsTarget("session")}
              onRemove={() => removeIndicator("session")}
            />
          )}
          {indicators.ichimoku && (
            <IndicatorPill
              name={`Ichimoku ${config.ichiTenkan}/${config.ichiKijun}/${config.ichiSenkouB}`}
              value={lastValues.ichiBias}
              color={INDICATOR_COLORS.ichimoku}
              hidden={hidden.ichimoku}
              onToggleHide={() => toggleHidden("ichimoku")}
              onSettings={() => setSettingsTarget("ichimoku")}
              onRemove={() => removeIndicator("ichimoku")}
            />
          )}
        </div>
      </div>

      {/* RSI pane label */}
      {indicators.rsi && paneOffsets[rsiPaneIdx] && (
        <div
          style={{ top: paneOffsets[rsiPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`RSI ${config.rsi}`}
            value={lastValues.rsi !== undefined ? lastValues.rsi.toFixed(2) : undefined}
            color={config.rsiColor}
            hidden={hidden.rsi}
            onToggleHide={() => toggleHidden("rsi")}
            onSettings={() => setSettingsTarget("rsi")}
            onRemove={() => removeIndicator("rsi")}
            onMaximize={() => toggleMaximizedPane("rsi")}
            maximized={maximizedPane === "rsi"}
          />
        </div>
      )}

      {/* MACD pane label */}
      {indicators.macd && paneOffsets[macdPaneIdx] && (
        <div
          style={{ top: paneOffsets[macdPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`MACD ${config.macdFast}, ${config.macdSlow}, ${config.macdSignal}`}
            value={
              lastValues.macd !== undefined
                ? `${lastValues.macd.toFixed(2)} / ${(lastValues.macdSignal ?? 0).toFixed(2)}`
                : undefined
            }
            color={INDICATOR_COLORS.macd}
            hidden={hidden.macd}
            onToggleHide={() => toggleHidden("macd")}
            onSettings={() => setSettingsTarget("macd")}
            onRemove={() => removeIndicator("macd")}
            onMaximize={() => toggleMaximizedPane("macd")}
            maximized={maximizedPane === "macd"}
          />
        </div>
      )}

      {/* Stochastic pane label */}
      {indicators.stoch && paneOffsets[stochPaneIdx] && (
        <div
          style={{ top: paneOffsets[stochPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`Stoch ${config.stochK}, ${config.stochD}, ${config.stochSmooth}`}
            value={
              lastValues.stochK !== undefined
                ? `%K ${lastValues.stochK.toFixed(1)} / %D ${(lastValues.stochD ?? 0).toFixed(1)}`
                : undefined
            }
            color={INDICATOR_COLORS.stoch}
            hidden={hidden.stoch}
            onToggleHide={() => toggleHidden("stoch")}
            onSettings={() => setSettingsTarget("stoch")}
            onRemove={() => removeIndicator("stoch")}
            onMaximize={() => toggleMaximizedPane("stoch")}
            maximized={maximizedPane === "stoch"}
          />
        </div>
      )}

      {/* Stochastic RSI pane label */}
      {indicators.stochrsi && paneOffsets[srsiPaneIdx] && (
        <div
          style={{ top: paneOffsets[srsiPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`Stoch RSI ${config.srsiRsiLen}, ${config.srsiStochLen}, ${config.srsiK}, ${config.srsiD}`}
            value={
              lastValues.srsiK !== undefined
                ? `%K ${lastValues.srsiK.toFixed(1)} / %D ${(lastValues.srsiD ?? 0).toFixed(1)}`
                : undefined
            }
            color={INDICATOR_COLORS.stochrsi}
            hidden={hidden.stochrsi}
            onToggleHide={() => toggleHidden("stochrsi")}
            onSettings={() => setSettingsTarget("stochrsi")}
            onRemove={() => removeIndicator("stochrsi")}
            onMaximize={() => toggleMaximizedPane("stochrsi")}
            maximized={maximizedPane === "stochrsi"}
          />
        </div>
      )}

      {/* WaveTrend pane label */}
      {indicators.wavetrend && paneOffsets[wtPaneIdx] && (
        <div
          style={{ top: paneOffsets[wtPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name={`WT ${config.wtChannel}, ${config.wtAvg}, ${config.wtSignal}`}
            value={
              lastValues.wt1 !== undefined
                ? `${lastValues.wt1.toFixed(1)} / ${(lastValues.wt2 ?? 0).toFixed(1)}`
                : undefined
            }
            color={INDICATOR_COLORS.wavetrend}
            hidden={hidden.wavetrend}
            onToggleHide={() => toggleHidden("wavetrend")}
            onSettings={() => setSettingsTarget("wavetrend")}
            onRemove={() => removeIndicator("wavetrend")}
            onMaximize={() => toggleMaximizedPane("wavetrend")}
            maximized={maximizedPane === "wavetrend"}
          />
        </div>
      )}

      {/* VuManChu Cipher B pane label */}
      {indicators.cipher && paneOffsets[cipherPaneIdx] && (
        <div
          style={{ top: paneOffsets[cipherPaneIdx].top + 6, left: 12 }}
          className="pointer-events-none absolute z-10"
        >
          <IndicatorPill
            name="Cipher B"
            value={
              lastValues.cipherWt2 !== undefined
                ? `WT ${lastValues.cipherWt2.toFixed(1)}`
                : undefined
            }
            color={CIPHER_COLORS.wt1}
            hidden={hidden.cipher}
            onToggleHide={() => toggleHidden("cipher")}
            onSettings={() => setSettingsTarget("cipher")}
            onRemove={() => removeIndicator("cipher")}
            onMaximize={() => toggleMaximizedPane("cipher")}
            maximized={maximizedPane === "cipher"}
          />
        </div>
      )}
    </div>
  );
}
