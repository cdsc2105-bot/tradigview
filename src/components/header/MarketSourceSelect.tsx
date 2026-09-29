"use client";

import { useEffect, useReducer, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PopoverPanel } from "@/components/ui/popover-panel";
import { fetchSupportedSymbols } from "@/lib/exchanges/symbols";
import { STOCK_SYMBOLS, stockLabel } from "@/lib/exchanges/stocks";
import { fetchLastPrice, stockOf, venueSymbolFor } from "@/lib/exchanges/venues";
import { formatPriceFor } from "@/lib/precision";
import {
  CRYPTO_EXCHANGES,
  EXCHANGE_LABELS,
  useChartStore,
  type Exchange,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/** Every venue, crypto first then the stock market. */
export const MARKET_SOURCES: { key: Exchange; label: string }[] = [
  ...CRYPTO_EXCHANGES.map((key) => ({ key, label: EXCHANGE_LABELS[key] })),
  { key: "stocks", label: EXCHANGE_LABELS.stocks },
];

/**
 * The same coin on another venue. Most list it as BASEUSDT, but some quote
 * small coins per 1000 units (1000PEPEUSDT), so try those spellings too.
 */
export function cryptoSymbolOn(symbol: string, listed: Set<string>): string | null {
  if (listed.has(symbol)) return symbol;
  const base = symbol.replace(/USDT$/, "").replace(/^(1000000|1000|1M)(?=[A-Z])/, "");
  for (const prefix of ["", "1000", "1000000", "1M"]) {
    const s = `${prefix}${base}USDT`;
    if (listed.has(s)) return s;
  }
  return null;
}

/** Where the current asset trades — the symbol on that venue, if any. */
async function symbolOn(venue: Exchange, exchange: Exchange, symbol: string): Promise<string | null> {
  const stock = stockOf(exchange, symbol);
  if (venue === "stocks") return stock;
  const listed = await fetchSupportedSymbols(venue);
  return stock ? venueSymbolFor(stock, listed) : cryptoSymbolOn(symbol, listed);
}

/**
 * Switch the data venue, keeping the same asset: BTC stays BTC, NVDA on the
 * stock market becomes NVDAUSDT on a venue that lists it. When the venue
 * doesn't have it, falls back to BTC (or the S&P 500 for the stock market).
 */
export function useSwitchMarket() {
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const setExchange = useChartStore((s) => s.setExchange);
  const setSymbol = useChartStore((s) => s.setSymbol);

  return async (next: Exchange) => {
    if (next === exchange) return;
    const same = await symbolOn(next, exchange, symbol).catch(() =>
      // List unavailable: keep the pair for crypto → crypto and let the chart try
      next !== "stocks" && !stockOf(exchange, symbol) ? symbol : null,
    );
    setExchange(next);
    setSymbol(same ?? (next === "stocks" ? STOCK_SYMBOLS[0] : "BTCUSDT"));
  };
}

export interface MarketOption {
  key: Exchange;
  label: string;
  /** The asset's symbol on this venue: null = not listed, undefined = checking */
  symbol: string | null | undefined;
  /** Last price there (undefined while loading) */
  price?: number | null;
}

/**
 * Shared across menu openings (and the mobile sheet): which pair the asset
 * is on each venue, and the last price seen there — so reopening the menu
 * shows numbers at once while they refresh.
 */
const resolvedOn = new Map<string, string | null>(); // "asset>venue" → symbol
const lastPrices = new Map<string, number | null>(); // "venue:symbol" → price
const inFlight = new Set<string>();
/** Mounted menus to redraw when any of the above changes */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function loadPrice(v: Exchange, s: string) {
  const k = `${v}:${s}`;
  if (inFlight.has(k)) return;
  inFlight.add(k);
  fetchLastPrice(v, s)
    .then(
      (p) => lastPrices.set(k, p),
      () => lastPrices.set(k, lastPrices.get(k) ?? null),
    )
    .finally(() => {
      inFlight.delete(k);
      notify();
    });
}

/**
 * The venues offered for the current asset, with its symbol and live price on
 * each: the six crypto venues for a coin; the stock market plus the crypto
 * venues that list the share for a stock. Loads while `warm` (menu open or
 * hovered) and keeps refreshing while `open`.
 */
export function useMarketOptions(
  warm: boolean,
  open = warm,
): { title: string; options: MarketOption[] } {
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const stock = stockOf(exchange, symbol);
  const venues: Exchange[] = stock ? ["stocks", ...CRYPTO_EXCHANGES] : CRYPTO_EXCHANGES;
  const assetKey = `${exchange}:${symbol}`;
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // Redraw on any result — even one requested by an earlier render (hover)
  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  useEffect(() => {
    if (!warm) return;

    const loadAll = () => {
      for (const v of venues) {
        const rk = `${assetKey}>${v}`;
        if (v === exchange) resolvedOn.set(rk, symbol);
        const known = resolvedOn.get(rk);
        if (known) {
          loadPrice(v, known);
          continue;
        }
        if (known === null || inFlight.has(rk)) continue;
        // Don't wait for the venue's pair list: a coin is almost always the
        // same pair everywhere, so ask its price right away. The list (cached
        // after the first time) then confirms it or names the right pair.
        if (!stock) loadPrice(v, symbol);
        inFlight.add(rk);
        symbolOn(v, exchange, symbol)
          .then(
            (s) => {
              resolvedOn.set(rk, s);
              if (s && s !== symbol) loadPrice(v, s);
            },
            // List unavailable: a coin keeps its pair (its price decides);
            // a share can't be matched without the list.
            () => resolvedOn.set(rk, stock ? null : symbol),
          )
          .finally(() => {
            inFlight.delete(rk);
            notify();
          });
      }
    };

    loadAll();
    const id = open ? setInterval(loadAll, 3_000) : undefined;
    return () => {
      if (id) clearInterval(id);
    };
    // `venues`/`stock` derive from the asset key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warm, open, assetKey]);

  const ref = stock ? lastPrices.get(`stocks:${stock}`) : undefined;
  const options = venues
    .map((key): MarketOption => {
      const known = resolvedOn.get(`${assetKey}>${key}`);
      // Before the list confirms it, show the guessed pair once it has a price
      const guess = !stock && known === undefined ? symbol : undefined;
      let s: string | null | undefined = known !== undefined ? known : guess;
      let price = s ? lastPrices.get(`${key}:${s}`) : undefined;
      if (known === undefined && guess && price === null) {
        s = undefined; // guess failed — wait for the list
        price = undefined;
      }
      // A share quoted far from its stock-market price is a different asset
      // that happens to share the ticker (e.g. a meme coin) — don't offer it.
      if (stock && key !== "stocks" && ref && price && Math.abs(price / ref - 1) > 0.3) s = null;
      return { key, label: EXCHANGE_LABELS[key], symbol: s, price };
    })
    // For stocks, Bitunix only shows up when it actually lists the share
    .filter((o) => !stock || !o.key.startsWith("bitunix") || o.symbol);

  const name = stock ? stockLabel(stock) : symbol.replace(/USDT$/, "").replace(/^(1000000|1000|1M)(?=[A-Z])/, "");
  return { title: `${name} en`, options };
}

/** Fetch every venue's pair list once the page has settled, so the venue menu opens ready. */
function usePreloadVenueLists() {
  useEffect(() => {
    const t = setTimeout(() => {
      for (const v of CRYPTO_EXCHANGES) void fetchSupportedSymbols(v).catch(() => {});
    }, 4_000);
    return () => clearTimeout(t);
  }, []);
}

export function MarketSourceSelect() {
  const exchange = useChartStore((s) => s.exchange);
  const switchMarket = useSwitchMarket();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  /** Pointer over the button: start fetching before the click lands */
  const [hovered, setHovered] = useState(false);
  const { title, options } = useMarketOptions(open || hovered, open);
  usePreloadVenueLists();

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-tv-text hover:bg-tv-panel-hover"
      >
        {EXCHANGE_LABELS[exchange]}
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </button>
      <PopoverPanel anchor={anchor} open={open} onClose={() => setOpen(false)} className="w-72">
        <div className="select-none px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-tv-text-dim">
          {title}
        </div>
        {options.map((o) => (
          <MarketOptionRow
            key={o.key}
            option={o}
            active={o.key === exchange}
            onPick={() => {
              setOpen(false);
              void switchMarket(o.key);
            }}
          />
        ))}
      </PopoverPanel>
    </>
  );
}

/** One venue: name, the pair it trades as (when it differs) and its price. */
export function MarketOptionRow({
  option: o,
  active,
  onPick,
  className,
}: {
  option: MarketOption;
  active: boolean;
  onPick: () => void;
  className?: string;
}) {
  const unlisted = o.symbol === null;
  return (
    <button
      type="button"
      role="menuitem"
      disabled={unlisted}
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors",
        active ? "bg-tv-panel-hover text-tv-text" : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
        unlisted && "cursor-default opacity-45 hover:bg-transparent hover:text-tv-text-muted",
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate", active && "font-medium")}>{o.label}</span>
        {o.symbol && o.key !== "stocks" && (
          <span className="truncate text-[10px] text-tv-text-dim">{o.symbol}</span>
        )}
      </span>
      <span className="shrink-0 text-right font-mono text-[12px] tabular-nums text-tv-text">
        {unlisted ? (
          <span className="font-sans text-[11px] text-tv-text-dim">No listado</span>
        ) : o.price ? (
          formatPriceFor(o.key, o.symbol ?? "", o.price)
        ) : o.price === null ? (
          <span className="font-sans text-[11px] text-tv-text-dim">—</span>
        ) : (
          <span className="inline-block h-2.5 w-12 animate-pulse rounded bg-tv-border" />
        )}
      </span>
      <Check className={cn("h-3.5 w-3.5 shrink-0 text-tv-accent", !active && "invisible")} />
    </button>
  );
}
