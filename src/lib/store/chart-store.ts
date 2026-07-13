"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "@/lib/binance/types";

export type Exchange = "binance" | "bitget";

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
  | "ichimoku";

export type DrawingTool = "cursor" | "hline" | "measure" | "eraser";

export interface PriceLine {
  id: string;
  symbol: string;
  price: number;
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
  /** VWAP deviation-band color (lines + shading) */
  vwapBandColor: string;
  /** How many σ bands to draw each side of the VWAP, 0–4 */
  vwapBands: number;
  /** Shade the area between consecutive VWAP bands */
  vwapFill: boolean;
  /** Opacity of that shading, 0–100 */
  vwapFillOpacity: number;
  /** Ichimoku Tenkan-sen period */
  ichiTenkan: number;
  /** Ichimoku Kijun-sen period */
  ichiKijun: number;
  /** Ichimoku Senkou Span B period */
  ichiSenkouB: number;
  /** Ichimoku forward/backward displacement */
  ichiDisplacement: number;
}

/** Standard-deviation multipliers for each VWAP band, innermost → outermost. */
export const VWAP_BAND_MULTIPLIERS = [1, 2, 3, 4] as const;

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
  stPeriod: 10,
  stMultiplier: 3,
  wtChannel: 9,
  wtAvg: 12,
  wtSignal: 3,
  ribbonLines: DEFAULT_RIBBON_LINES,
  ribbonFill: true,
  ribbonFillOpacity: 10,
  vwapColor: "#2962ff",
  vwapBandColor: "#26a69a",
  vwapBands: 3,
  vwapFill: true,
  vwapFillOpacity: 8,
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
  rsi: "#ab47bc",
  macd: "#2962ff",
  volume: "#787b86",
  bb: "#e91e63",
  stoch: "#00bcd4",
  supertrend: "#4caf50",
  vwap: "#e040fb",
  wavetrend: "#26c6da",
  ribbon: "#22d3ee",
  ichimoku: "#26a69a",
};

/**
 * Not every symbol exists on both venues — HYPEUSDT is Bitget-only, for
 * instance. The watchlist filters each section against the exchange's real
 * symbol list, so listing a pair here that one venue lacks is harmless.
 */
export const DEFAULT_WATCHLIST = [
  // Majors (roughly by market cap)
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "TRXUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "LTCUSDT",
  "BCHUSDT",
  // L1 / L2 / narrativas
  "HYPEUSDT",
  "SUIUSDT",
  "NEARUSDT",
  "APTUSDT",
  "ATOMUSDT",
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
  "AAVEUSDT",
  "UNIUSDT",
  // Memes
  "PEPEUSDT",
  "WIFUSDT",
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
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  setTool: (t: DrawingTool) => void;
  addPriceLine: (price: number, symbol: string) => void;
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
        stoch: false,
        supertrend: false,
        vwap: true,
        wavetrend: true,
        ribbon: true,
        ichimoku: false,
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
      },
      config: {
        ...DEFAULT_CONFIG,
        ribbonLines: DEFAULT_RIBBON_LINES.map((l) => ({ ...l })),
      },
      watchlist: DEFAULT_WATCHLIST,
      tool: "cursor",
      priceLines: [],
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
      clearPriceLines: (symbol) =>
        set((state) => ({
          priceLines: symbol
            ? state.priceLines.filter((p) => p.symbol !== symbol)
            : [],
        })),
      setSymbolDialogOpen: (symbolDialogOpen) => set({ symbolDialogOpen }),
      setWatchlistOpen: (watchlistOpen) => set({ watchlistOpen }),
      setSettingsTarget: (settingsTarget) => set({ settingsTarget }),
    }),
    {
      name: "tv-gratis-chart-state",
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
          config: { ...current.config, ...p.config, ribbonLines },
          watchlist: [...DEFAULT_WATCHLIST, ...extras],
        };
      },
    },
  ),
);
