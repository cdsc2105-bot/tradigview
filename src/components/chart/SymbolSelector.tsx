"use client";

import { useEffect, useState, useMemo } from "react";
import { Search } from "lucide-react";
import { CoinIcon, baseAsset } from "@/components/brand/CoinIcon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchSupportedSymbols } from "@/lib/exchanges/symbols";
import { stockLabel } from "@/lib/exchanges/stocks";
import {
  useChartStore,
  POPULAR_SYMBOLS,
  type Exchange,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

const TABS: { key: Exchange; label: string }[] = [
  { key: "binance", label: "Binance" },
  { key: "binancef", label: "Binance Perp" },
  { key: "bitget", label: "Bitget Perp" },
  { key: "stocks", label: "Acciones" },
];

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const setExchange = useChartStore((s) => s.setExchange);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");
  // Which exchange's list to browse — starts on the chart's current exchange.
  const [tab, setTab] = useState<Exchange>(exchange);
  const [symbolsByExchange, setSymbolsByExchange] = useState<
    Partial<Record<Exchange, string[]>>
  >({});
  /** Venues whose full list failed to load (shown with a retry) */
  const [failed, setFailed] = useState<Partial<Record<Exchange, boolean>>>({});
  const [retry, setRetry] = useState(0);

  // When the dialog opens, sync the tab to the current exchange.
  useEffect(() => {
    if (open) setTab(exchange);
  }, [open, exchange]);

  // Load the symbol list for the active tab (each venue lists different pairs —
  // HYPEUSDT / Hyperliquid is Bitget-only, for instance).
  useEffect(() => {
    if (!open || symbolsByExchange[tab]) return;
    let cancelled = false;
    fetchSupportedSymbols(tab)
      .then((set) => {
        if (cancelled) return;
        setSymbolsByExchange((prev) => ({ ...prev, [tab]: [...set].sort() }));
        setFailed((prev) => ({ ...prev, [tab]: false }));
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setFailed((prev) => ({ ...prev, [tab]: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, retry, symbolsByExchange]);

  const loaded = symbolsByExchange[tab];
  const filtered = useMemo(() => {
    // Until the venue's full list arrives, offer the well-known coins so the
    // dialog is usable instantly; the list is filtered for real once loaded.
    const list = symbolsByExchange[tab] ?? (tab === "stocks" ? [] : POPULAR_SYMBOLS);
    const q = query.trim().toUpperCase();

    let result: string[];
    if (tab === "stocks") {
      // Short curated list — show it whole, and match on the pretty name too
      // so "nasdaq" finds ^IXIC.
      result = q
        ? list.filter(
            (s) => s.includes(q) || stockLabel(s).toUpperCase().includes(q),
          )
        : list;
    } else if (!q) {
      // No search: show only the well-known coins (in popularity order) that
      // this exchange actually lists — avoids the wall of obscure listings.
      const listSet = new Set(list);
      result = POPULAR_SYMBOLS.filter((s) => listSet.has(s));
    } else {
      // Searching: match everything, but float known coins to the top.
      const rank = new Map(POPULAR_SYMBOLS.map((s, i) => [s, i]));
      result = list
        .filter((s) => s.includes(q))
        .sort((a, b) => {
          const ra = rank.get(a) ?? Infinity;
          const rb = rank.get(b) ?? Infinity;
          return ra !== rb ? ra - rb : a.localeCompare(b);
        });
    }

    return result.slice(0, 100).map((s) => ({
      symbol: s,
      baseAsset:
        tab === "stocks"
          ? stockLabel(s)
          : s.endsWith("USDT")
            ? s.slice(0, -4)
            : s,
      quoteAsset: tab === "stocks" ? "" : s.endsWith("USDT") ? "USDT" : "",
    }));
  }, [query, symbolsByExchange, tab]);

  const select = (s: string) => {
    setExchange(tab);
    setSymbol(s);
    addToWatchlist(s);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Buscar moneda"
        className="group flex h-[30px] w-24 shrink-0 items-center gap-2 rounded-[7px] border border-tv-border bg-tv-surface px-2.5 text-[13px] font-semibold text-tv-text transition-colors hover:border-tv-border-strong md:w-28"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-tv-text-muted group-hover:text-tv-text" />
        <span className="truncate">
          {exchange === "stocks" ? stockLabel(symbol) : baseAsset(symbol)}
        </span>
      </button>
      {/* Conditionally mounted so it fully closes (base-ui's exit animation
          lingers with this app's Tailwind setup). */}
      {open ? (
      <Dialog open onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-md gap-0 border border-tv-border-strong bg-tv-surface p-0"
        >
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Buscar símbolo</DialogTitle>
        </DialogHeader>

        {/* Exchange tabs — switch venue right here */}
        <div className="flex gap-1 border-b border-tv-border px-3 pt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-t px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.key
                  ? "bg-tv-panel-hover text-tv-text"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="border-b border-tv-border p-3">
          <Input
            autoFocus
            placeholder="BTC, ETH, HYPE…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
          {tab === "binance" && query.trim().toUpperCase().startsWith("HYPE") && (
            <p className="mt-2 text-[11px] text-tv-yellow">
              ¿Buscas Hyperliquid (HYPE)? Está solo en Bitget → toca la pestaña
              “Bitget Perp”.
            </p>
          )}
        </div>

        <ScrollArea className="h-[380px]">
          <div className="flex flex-col">
            {failed[tab] && !loaded && (
              <div className="flex items-center justify-between gap-3 border-b border-tv-border px-4 py-2 text-[11px] text-tv-yellow">
                <span>No se pudo cargar la lista completa de este mercado.</span>
                <button
                  type="button"
                  onClick={() => {
                    setFailed((prev) => ({ ...prev, [tab]: false }));
                    setRetry((r) => r + 1);
                  }}
                  className="shrink-0 rounded border border-tv-border px-2 py-0.5 text-tv-text hover:bg-tv-panel-hover"
                >
                  Reintentar
                </button>
              </div>
            )}
            {!query.trim() && filtered.length > 0 && (
              <div className="select-none px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                Populares · escribe para buscar más
                {!loaded && !failed[tab] && tab !== "stocks" && (
                  <span className="ml-1 normal-case tracking-normal text-tv-text-dim">
                    (cargando lista completa…)
                  </span>
                )}
              </div>
            )}
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                {loaded || failed[tab] ? "Sin resultados" : "Cargando…"}
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={s.symbol}
                onClick={() => select(s.symbol)}
                className={cn(
                  "flex items-center justify-between border-b border-tv-border px-4 py-2 text-left text-xs hover:bg-tv-panel-hover",
                  s.symbol === symbol && tab === exchange && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-3">
                  <CoinIcon symbol={s.symbol} />
                  <span className="font-semibold text-tv-text">{s.baseAsset}</span>
                  {s.quoteAsset && (
                    <span className="text-tv-text-muted">/ {s.quoteAsset}</span>
                  )}
                </div>
                <span className="text-[10px] text-tv-text-dim">
                  {TABS.find((t) => t.key === tab)?.label}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
        </DialogContent>
      </Dialog>
      ) : null}
    </>
  );
}
