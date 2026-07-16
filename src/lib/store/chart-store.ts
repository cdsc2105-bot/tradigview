"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";

export type Exchange = "binance" | "binancef" | "bitget";

/** Display names — "binancef" is Binance's USDT-M perpetual futures. */
export const EXCHANGE_LABELS: Record<Exchange, string> = {
  binance: "Binance",
  binancef: "Binance Perp",
  bitget: "Bitget Perp",
};

export type IndicatorKey =
  | "ema20"
  | "ema50"
  | "ema200"
  | "rsi"
  | "macd"
  | "volume"
  | "bb"
  | "stoch"
  | "supertrend"
  | "vwap"
  | "wavetrend"
  | "ribbon"
  | "ichimoku"
  | "session"
  | "stochrsi";

export type DrawingTool = "cursor" | "hline" | "trend" | "measure" | "eraser";

export interface PriceLine {
  id: string;
  symbol: string;
  price: number;
}

/** A user-drawn trend line between two chart points, kept per symbol. */
export interface TrendLine {
  id: string;
  symbol: string;
  t1: number;
  p1: number;
  t2: number;
  p2: number;
}

export interface IndicatorConfig {
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  bbPeriod: number;
  bbStdDev: number;
  stochK: number;
  stochD: number;
  stochSmooth: number;
  /** Stochastic RSI: RSI length, stochastic length, %K and %D smoothing */
  srsiRsiLen: number;
  srsiStochLen: number;
  srsiK: number;
  srsiD: number;
  stPeriod: number;
  stMultiplier: number;
  wtChannel: number;
  wtAvg: number;
  wtSignal: number;
  /** EMA ribbon lines, ordered fast → slow */
  ribbonLines: RibbonLine[];
  /** Shade the area between the fastest and slowest enabled EMA */
  ribbonFill: boolean;
  /** Opacity of that shading, 0–100 */
  ribbonFillOpacity: number;
  /** VWAP center-line color */
  vwapColor: string;
  /** Color of the shading between bands */
  vwapFillColor: string;
  /** Deviation bands drawn each side of the VWAP, innermost → outermost */
  vwapBandLines: VwapBand[];
  /** Shade the area between consecutive VWAP bands */
  vwapFill: boolean;
  /** Opacity of that shading, 0–100 */
  vwapFillOpacity: number;
  /** Label RSI divergences (bull / hidden_bull / bear / hidden_bear) */
  rsiDiv: boolean;
  /** Bars to the left of an RSI pivot that must be lower/higher than it */
  rsiDivLeft: number;
  /** Bars to the right — a pivot is only confirmed this many bars later */
  rsiDivRight: number;
  /** Moving-average line over the RSI, like CdeCripto's panel */
  rsiMa: boolean;
  /** Period of that moving average */
  rsiMaPeriod: number;
  /** RSI line color (white in CdeCripto's TradingView) */
  rsiColor: string;
  /** RSI moving-average color (yellow in his chart) */
  rsiMaColor: string;
  /** Minutes before/after the session open for the flanking session lines */
  sessionOffsetMin: number;
  /** Ichimoku Tenkan-sen period */
  ichiTenkan: number;
  /** Ichimoku Kijun-sen period */
  ichiKijun: number;
  /** Ichimoku Senkou Span B period */
  ichiSenkouB: number;
  /** Ichimoku forward/backward displacement */
  ichiDisplacement: number;
}

/**
 * One VWAP deviation band, drawn at vwap ± multiplier·σ (both sides).
 * TradingView calls these "Multiplicador de bandas #1/#2/#3" — same idea, and
 * the multiplier is a free number, not a fixed 1σ/2σ/3σ ladder.
 */
export interface VwapBand {
  multiplier: number;
  enabled: boolean;
  /** Line color, and the color of its price label on the right axis */
  color: string;
}

export const MAX_VWAP_BANDS = 4;

/** Band colors as CdeCripto draws them: 1σ green, 2σ olive, 3σ cyan. */
export const DEFAULT_VWAP_BANDS: VwapBand[] = [
  { multiplier: 1, enabled: true, color: "#26a69a" },
  { multiplier: 2, enabled: true, color: "#b0a83b" },
  { multiplier: 3, enabled: true, color: "#4dd0e1" },
];

/** Fallback color for a band the user added past the presets. */
export const VWAP_BAND_PALETTE = ["#26a69a", "#b0a83b", "#4dd0e1", "#ab47bc"];

/** One configurable line of the EMA ribbon. */
export interface RibbonLine {
  period: number;
  color: string;
  /** Stroke width in px, 1–4 */
  width: number;
  enabled: boolean;
}

export const MAX_RIBBON_LINES = 8;

export const DEFAULT_RIBBON_LINES: RibbonLine[] = [
  { period: 9, color: "#22d3ee", width: 1, enabled: true },
  { period: 21, color: "#2962ff", width: 1, enabled: true },
  { period: 50, color: "#26a69a", width: 2, enabled: true },
  { period: 100, color: "#ffb74d", width: 2, enabled: true },
  { period: 200, color: "#ef5350", width: 2, enabled: true },
];

export const DEFAULT_CONFIG: IndicatorConfig = {
  ema20: 20,
  ema50: 50,
  ema200: 200,
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bbPeriod: 20,
  bbStdDev: 2,
  stochK: 14,
  stochD: 3,
  stochSmooth: 3,
  srsiRsiLen: 14,
  srsiStochLen: 14,
  srsiK: 3,
  srsiD: 3,
  stPeriod: 10,
  stMultiplier: 3,
  wtChannel: 9,
  wtAvg: 12,
  wtSignal: 3,
  ribbonLines: DEFAULT_RIBBON_LINES,
  ribbonFill: true,
  ribbonFillOpacity: 10,
  vwapColor: "#2962ff",
  vwapFillColor: "#26a69a",
  vwapBandLines: DEFAULT_VWAP_BANDS,
  vwapFill: true,
  vwapFillOpacity: 8,
  rsiDiv: true,
  rsiDivLeft: 5,
  rsiDivRight: 5,
  rsiMa: true,
  rsiMaPeriod: 14,
  rsiColor: "#d1d4dc",
  rsiMaColor: "#e2c55a",
  sessionOffsetMin: 90,
  ichiTenkan: 9,
  ichiKijun: 26,
  ichiSenkouB: 52,
  ichiDisplacement: 26,
};

/** Ichimoku line colors, matching TradingView's defaults. */
export const ICHIMOKU_COLORS = {
  tenkan: "#2962ff", // conversion — blue
  kijun: "#ef5350", // base — red
  senkouA: "#26a69a", // leading span A — green
  senkouB: "#ef5350", // leading span B — red
  chikou: "#9c27b0", // lagging — purple
  cloudUp: "#26a69a", // bullish cloud fill
  cloudDown: "#ef5350", // bearish cloud fill
} as const;

export const INDICATOR_COLORS: Record<IndicatorKey, string> = {
  ema20: "#ffb74d",
  ema50: "#2962ff",
  ema200: "#ab47bc",
  // Blue, like CdeCripto's RSI (was purple)
  rsi: "#2962ff",
  macd: "#2962ff",
  volume: "#787b86",
  bb: "#e91e63",
  // TradingView's stochastic defaults: %K blue, %D orange
  stoch: "#2962ff",
  stochrsi: "#2962ff",
  supertrend: "#4caf50",
  vwap: "#e040fb",
  wavetrend: "#26c6da",
  ribbon: "#22d3ee",
  ichimoku: "#26a69a",
  session: "#2962ff",
};

/** TradingView oscillator styling shared by both stochastic panes. */
export const STOCH_COLORS = {
  k: "#2962ff", // %K blue
  d: "#ff6d00", // %D orange
  /** Soft blue 20–80 zone, TV's stochastic band background */
  band: "#2196f3",
} as const;

/** RSI pane extras, matching CdeCripto's TradingView. */
export const RSI_COLORS = {
  /** Purple 30–70 background zone, TV's RSI default */
  band: "#7e57c2",
  /** Divergence trend lines drawn over the RSI */
  bull: "#26a69a",
  bear: "#ef5350",
} as const;

/** Colors of the three session lines, matching CdeCripto's chart. */
export const SESSION_COLORS = {
  open: "#9c27b0", // purple — the New York open itself
  flank: "#2962ff", // blue — the −1h30 / +1h30 markers
} as const;

/**
 * Not every symbol exists on both venues — HYPEUSDT is Bitget-only, for
 * instance. The watchlist filters each section against the exchange's real
 * symbol list, so listing a pair here that one venue lacks is harmless.
 */
export const DEFAULT_WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "LTCUSDT",
  "TRXUSDT",
  "HYPEUSDT",
  "SUIUSDT",
];

/**
 * Well-known coins shown first in the symbol search (before the long tail of
 * obscure listings). Ordered roughly by recognition / market cap.
 */
export const POPULAR_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "LTCUSDT",
  "TRXUSDT",
  "BCHUSDT",
  "HYPEUSDT",
  "SUIUSDT",
  "NEARUSDT",
  "APTUSDT",
  "ATOMUSDT",
  "UNIUSDT",
  "AAVEUSDT",
  "ARBUSDT",
  "OPUSDT",
  "INJUSDT",
  "TIAUSDT",
  "SEIUSDT",
  "TAOUSDT",
  "POLUSDT",
  "ONDOUSDT",
  "ENAUSDT",
  "RENDERUSDT",
  "WLDUSDT",
  "JUPUSDT",
  "FILUSDT",
  "ETCUSDT",
  "ALGOUSDT",
  "PEPEUSDT",
  "WIFUSDT",
  "BONKUSDT",
  "SHIBUSDT",
  "FARTCOINUSDT",
];

interface ChartState {
  symbol: string;
  exchange: Exchange;
  timeframe: Timeframe;
  /** Indicator is added to the chart (appears in pill + renders unless hidden) */
  indicators: Record<IndicatorKey, boolean>;
  /** Indicator is hidden (eye icon off) — kept in pill list, just not rendered */
  hidden: Record<IndicatorKey, boolean>;
  /** Periods and parameters for each indicator */
  config: IndicatorConfig;
  watchlist: string[];

  // Ephemeral UI state (not persisted)
  tool: DrawingTool;
  priceLines: PriceLine[];
  trendLines: TrendLine[];
  symbolDialogOpen: boolean;
  /** Watchlist drawer open (mobile only; desktop shows it inline) */
  watchlistOpen: boolean;
  /** Which indicator's settings dialog is open (null = closed) */
  settingsTarget: IndicatorKey | null;

  // Actions
  setSymbol: (s: string) => void;
  setExchange: (e: Exchange) => void;
  setTimeframe: (t: Timeframe) => void;
  toggleIndicator: (key: IndicatorKey) => void;
  removeIndicator: (key: IndicatorKey) => void;
  toggleHidden: (key: IndicatorKey) => void;
  setConfig: (patch: Partial<IndicatorConfig>) => void;
  setRibbonLine: (index: number, patch: Partial<RibbonLine>) => void;
  addRibbonLine: () => void;
  removeRibbonLine: (index: number) => void;
  resetRibbon: () => void;
  setVwapBand: (index: number, patch: Partial<VwapBand>) => void;
  addVwapBand: () => void;
  removeVwapBand: (index: number) => void;
  resetVwap: () => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  setTool: (t: DrawingTool) => void;
  addPriceLine: (price: number, symbol: string) => void;
  addTrendLine: (line: Omit<TrendLine, "id">) => void;
  /** Clears price lines AND trend lines for the symbol (or all) */
  clearPriceLines: (symbol?: string) => void;
  setSymbolDialogOpen: (v: boolean) => void;
  setWatchlistOpen: (v: boolean) => void;
  setSettingsTarget: (k: IndicatorKey | null) => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: "BTCUSDT",
      exchange: "binance" as Exchange,
      timeframe: "15m" as Timeframe,
      indicators: {
        ema20: false,
        ema50: false,
        ema200: false,
        rsi: true,
        macd: false,
        volume: true,
        bb: false,
        stoch: true,
        supertrend: false,
        vwap: true,
        wavetrend: false,
        ribbon: true,
        ichimoku: false,
        session: true,
        stochrsi: false,
      },
      hidden: {
        ema20: false,
        ema50: false,
        ema200: false,
        rsi: false,
        macd: false,
        volume: false,
        bb: false,
        stoch: false,
        supertrend: false,
        vwap: false,
        wavetrend: false,
        ribbon: false,
        ichimoku: false,
        session: false,
        stochrsi: false,
      },
      config: {
        ...DEFAULT_CONFIG,
        ribbonLines: DEFAULT_RIBBON_LINES.map((l) => ({ ...l })),
        vwapBandLines: DEFAULT_VWAP_BANDS.map((b) => ({ ...b })),
      },
      watchlist: DEFAULT_WATCHLIST,
      tool: "cursor",
      priceLines: [],
      trendLines: [],
      symbolDialogOpen: false,
      watchlistOpen: false,
      settingsTarget: null,

      setSymbol: (symbol) => set({ symbol }),
      setExchange: (exchange) => set({ exchange }),
      setTimeframe: (timeframe) => set({ timeframe }),
      toggleIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: !s.indicators[key] },
          // When re-adding, ensure not hidden
          hidden: !s.indicators[key]
            ? { ...s.hidden, [key]: false }
            : s.hidden,
        })),
      removeIndicator: (key) =>
        set((s) => ({
          indicators: { ...s.indicators, [key]: false },
          hidden: { ...s.hidden, [key]: false },
        })),
      toggleHidden: (key) =>
        set((s) => ({ hidden: { ...s.hidden, [key]: !s.hidden[key] } })),
      setConfig: (patch) =>
        set((s) => ({ config: { ...s.config, ...patch } })),
      setRibbonLine: (index, patch) =>
        set((s) => ({
          config: {
            ...s.config,
            ribbonLines: s.config.ribbonLines.map((l, i) =>
              i === index ? { ...l, ...patch } : l,
            ),
          },
        })),
      addRibbonLine: () =>
        set((s) => {
          if (s.config.ribbonLines.length >= MAX_RIBBON_LINES) return s;
          const slowest = s.config.ribbonLines.at(-1);
          const next: RibbonLine = {
            period: Math.min((slowest?.period ?? 50) * 2, 500),
            color: "#787b86",
            width: 2,
            enabled: true,
          };
          return {
            config: { ...s.config, ribbonLines: [...s.config.ribbonLines, next] },
          };
        }),
      removeRibbonLine: (index) =>
        set((s) => {
          if (s.config.ribbonLines.length <= 1) return s;
          return {
            config: {
              ...s.config,
              ribbonLines: s.config.ribbonLines.filter((_, i) => i !== index),
            },
          };
        }),
      resetRibbon: () =>
        set((s) => ({
          config: {
            ...s.config,
            ribbonLines: DEFAULT_RIBBON_LINES.map((l) => ({ ...l })),
            ribbonFill: DEFAULT_CONFIG.ribbonFill,
            ribbonFillOpacity: DEFAULT_CONFIG.ribbonFillOpacity,
          },
        })),
      setVwapBand: (index, patch) =>
        set((s) => ({
          config: {
            ...s.config,
            vwapBandLines: s.config.vwapBandLines.map((b, i) =>
              i === index ? { ...b, ...patch } : b,
            ),
          },
        })),
      addVwapBand: () =>
        set((s) => {
          if (s.config.vwapBandLines.length >= MAX_VWAP_BANDS) return s;
          const outermost = s.config.vwapBandLines.at(-1);
          const next: VwapBand = {
            multiplier: Math.min((outermost?.multiplier ?? 0) + 1, 10),
            enabled: true,
            color:
              VWAP_BAND_PALETTE[
                s.config.vwapBandLines.length % VWAP_BAND_PALETTE.length
              ],
          };
          return {
            config: {
              ...s.config,
              vwapBandLines: [...s.config.vwapBandLines, next],
            },
          };
        }),
      removeVwapBand: (index) =>
        set((s) => ({
          config: {
            ...s.config,
            vwapBandLines: s.config.vwapBandLines.filter((_, i) => i !== index),
          },
        })),
      resetVwap: () =>
        set((s) => ({
          config: {
            ...s.config,
            vwapColor: DEFAULT_CONFIG.vwapColor,
            vwapFillColor: DEFAULT_CONFIG.vwapFillColor,
            vwapBandLines: DEFAULT_VWAP_BANDS.map((b) => ({ ...b })),
            vwapFill: DEFAULT_CONFIG.vwapFill,
            vwapFillOpacity: DEFAULT_CONFIG.vwapFillOpacity,
          },
        })),
      addToWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.includes(s)
            ? state.watchlist
            : [...state.watchlist, s],
        })),
      removeFromWatchlist: (s) =>
        set((state) => ({
          watchlist: state.watchlist.filter((x) => x !== s),
        })),
      setTool: (tool) => set({ tool }),
      addPriceLine: (price, symbol) =>
        set((state) => ({
          priceLines: [
            ...state.priceLines,
            {
              id:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `${Date.now()}-${Math.random()}`,
              symbol,
              price,
            },
          ],
        })),
      addTrendLine: (line) =>
        set((state) => ({
          trendLines: [
            ...state.trendLines,
            {
              ...line,
              id:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `${Date.now()}-${Math.random()}`,
            },
          ],
        })),
      clearPriceLines: (symbol) =>
        set((state) => ({
          priceLines: symbol
            ? state.priceLines.filter((p) => p.symbol !== symbol)
            : [],
          trendLines: symbol
            ? state.trendLines.filter((t) => t.symbol !== symbol)
            : [],
        })),
      setSymbolDialogOpen: (symbolDialogOpen) => set({ symbolDialogOpen }),
      setWatchlistOpen: (watchlistOpen) => set({ watchlistOpen }),
      setSettingsTarget: (settingsTarget) => set({ settingsTarget }),
    }),
    {
      name: "tv-gratis-chart-state",
      // Bump when we need a one-time reset of persisted fields. v1 trims the
      // watchlist down to the shorter known-coins default. v2 forces the
      // CdeCripto-style VWAP + RSI setup over whatever was saved before.
      // v3 turns on the double-stochastic bottom panes (Stoch RSI + Stoch).
      // v4 matches Matt's real TradingView bottom: RSI + Stochastic only.
      version: 4,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<ChartState>;
        let migrated =
          version < 1 ? { ...p, watchlist: [...DEFAULT_WATCHLIST] } : p;
        if (version < 2) {
          migrated = {
            ...migrated,
            indicators: {
              ...migrated.indicators,
              rsi: true,
              vwap: true,
              session: true,
            } as ChartState["indicators"],
            config: {
              ...migrated.config,
              vwapColor: DEFAULT_CONFIG.vwapColor,
              vwapFillColor: DEFAULT_CONFIG.vwapFillColor,
              vwapBandLines: DEFAULT_VWAP_BANDS.map((b) => ({ ...b })),
              vwapFill: DEFAULT_CONFIG.vwapFill,
              vwapFillOpacity: DEFAULT_CONFIG.vwapFillOpacity,
              rsiDiv: true,
              rsiMa: true,
              rsiMaPeriod: DEFAULT_CONFIG.rsiMaPeriod,
            } as IndicatorConfig,
          };
        }
        if (version < 3) {
          migrated = {
            ...migrated,
            indicators: {
              ...migrated.indicators,
              stoch: true,
              stochrsi: true,
              // Matt's TradingView bottom shows the two stochastics, not WaveTrend
              wavetrend: false,
            } as ChartState["indicators"],
            config: {
              ...migrated.config,
              stochK: DEFAULT_CONFIG.stochK,
              stochD: DEFAULT_CONFIG.stochD,
              stochSmooth: DEFAULT_CONFIG.stochSmooth,
            } as IndicatorConfig,
          };
        }
        if (version < 4) {
          // A better look at his layout: the bottom is RSI + Stochastic, and the
          // pane we first read as a second stochastic was the RSI with its
          // divergence trend lines. Leave Stoch RSI available but off.
          migrated = {
            ...migrated,
            indicators: {
              ...migrated.indicators,
              rsi: true,
              stoch: true,
              stochrsi: false,
            } as ChartState["indicators"],
            config: {
              ...migrated.config,
              rsiColor: DEFAULT_CONFIG.rsiColor,
              rsiMaColor: DEFAULT_CONFIG.rsiMaColor,
            } as IndicatorConfig,
          };
        }
        // merge() below tolerates a partial shape and fills the rest.
        return migrated as ChartState;
      },
      partialize: (s) => ({
        symbol: s.symbol,
        exchange: s.exchange,
        timeframe: s.timeframe,
        indicators: s.indicators,
        hidden: s.hidden,
        config: s.config,
        watchlist: s.watchlist,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<ChartState>;

        // Older persisted states predate `ribbonLines` (they stored ribbon1…ribbon5)
        // and could carry an empty array, which would leave the ribbon undrawable.
        const persistedLines = p.config?.ribbonLines;
        const ribbonLines =
          Array.isArray(persistedLines) && persistedLines.length > 0
            ? persistedLines
            : DEFAULT_RIBBON_LINES.map((l) => ({ ...l }));

        // `vwapBandLines` replaced a plain band *count* (`vwapBands`) whose
        // multipliers were hard-coded 1/2/3/4. Rebuild the equivalent bands from
        // that count so an old state keeps the bands it was drawing.
        const persistedBands = p.config?.vwapBandLines;
        const legacyCount = (p.config as { vwapBands?: number } | undefined)
          ?.vwapBands;
        const rawBands: Omit<VwapBand, "color">[] = Array.isArray(persistedBands)
          ? persistedBands
          : typeof legacyCount === "number"
            ? [1, 2, 3, 4]
                .slice(0, Math.max(0, Math.min(MAX_VWAP_BANDS, legacyCount)))
                .map((multiplier) => ({ multiplier, enabled: true }))
            : DEFAULT_VWAP_BANDS.map((b) => ({ ...b }));
        // Bands persisted before they had their own color fall back to the palette.
        const vwapBandLines: VwapBand[] = rawBands.map((b, i) => ({
          ...b,
          color:
            (b as Partial<VwapBand>).color ??
            VWAP_BAND_PALETTE[i % VWAP_BAND_PALETTE.length],
        }));

        // Tokens that were delisted or are commonly added by mistake (HYPERUSDT
        // is Hyperlane, not Hyperliquid — that's HYPEUSDT on Bitget).
        const PURGE = new Set(["MATICUSDT", "HYPERUSDT"]);

        // Keep whatever the user added, but surface newly shipped defaults
        // (e.g. HYPEUSDT) instead of freezing them out of an old watchlist.
        const extras = (p.watchlist ?? []).filter(
          (s) => !DEFAULT_WATCHLIST.includes(s) && !PURGE.has(s),
        );

        return {
          ...current,
          ...p,
          exchange: p.exchange ?? "binance",
          indicators: { ...current.indicators, ...p.indicators },
          hidden: { ...current.hidden, ...p.hidden },
          config: { ...current.config, ...p.config, ribbonLines, vwapBandLines },
          watchlist: [...DEFAULT_WATCHLIST, ...extras],
        };
      },
    },
  ),
);
