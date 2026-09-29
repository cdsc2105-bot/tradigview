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
import { STOCK_SYMBOLS, stockLabel } from "@/lib/exchanges/stocks";
import {
  useChartStore,
  CRYPTO_EXCHANGES,
  EXCHANGE_LABELS,
  POPULAR_SYMBOLS,
  type Exchange,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

type Tab = "crypto" | "stocks";
const TABS: { key: Tab; label: string }[] = [
  { key: "crypto", label: "Cripto" },
  { key: "stocks", label: "Acciones" },
];

/**
 * One search for all crypto venues: the list is the union of every venue's
 * pairs, and picking one opens it on the current venue when that lists it
 * (otherwise the first venue that does). The market can then be changed from
 * the header's venue menu, which shows the price on each.
 */
export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const setExchange = useChartStore((s) => s.setExchange);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>(exchange === "stocks" ? "stocks" : "crypto");
  /** Each crypto venue's list as it arrives */
  const [lists, setLists] = useState<Partial<Record<Exchange, Set<string>>>>({});
  /** Venues whose list failed to load */
  const [failed, setFailed] = useState<Partial<Record<Exchange, boolean>>>({});
  const [retry, setRetry] = useState(0);

  // When the dialog opens, start on the kind of asset being charted.
  useEffect(() => {
    if (open) setTab(exchange === "stocks" ? "stocks" : "crypto");
  }, [open, exchange]);

  // Load every crypto venue's list (each is fetched once per session and
  // shared with the watchlist and the venue menu).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    for (const v of CRYPTO_EXCHANGES) {
      if (lists[v]) continue;
      fetchSupportedSymbols(v)
        .then((set) => {
          if (cancelled) return;
          setLists((prev) => ({ ...prev, [v]: set }));
          setFailed((prev) => ({ ...prev, [v]: false }));
        })
        .catch((e) => {
          console.error(e);
          if (!cancelled) setFailed((prev) => ({ ...prev, [v]: true }));
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retry]);

  const loadedVenues = CRYPTO_EXCHANGES.filter((v) => lists[v]);
  const pending = CRYPTO_EXCHANGES.some((v) => !lists[v] && !failed[v]);
  const allFailed = CRYPTO_EXCHANGES.every((v) => failed[v]);
  const loaded = tab === "stocks" || loadedVenues.length > 0;

  /** The venue a crypto pick opens on: the current one if it lists the pair. */
  const venueFor = (s: string): Exchange | null => {
    const current = exchange !== "stocks" ? exchange : "binance";
    if (lists[current]?.has(s)) return current;
    return CRYPTO_EXCHANGES.find((v) => lists[v]?.has(s)) ?? null;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let result: string[];
    if (tab === "stocks") {
      // Short curated list — show it whole, and match on the pretty name too
      // so "nasdaq" finds ^IXIC.
      result = q
        ? STOCK_SYMBOLS.filter((s) => s.includes(q) || stockLabel(s).toUpperCase().includes(q))
        : STOCK_SYMBOLS;
    } else {
      const union = new Set<string>();
      for (const v of CRYPTO_EXCHANGES) lists[v]?.forEach((s) => union.add(s));
      // Until a list arrives, offer the well-known coins so the dialog is
      // usable instantly.
      const all = union.size > 0 ? union : new Set(POPULAR_SYMBOLS);
      if (!q) {
        // No search: the well-known coins, in popularity order.
        result = POPULAR_SYMBOLS.filter((s) => all.has(s));
      } else {
        // Searching: match everything, known coins and exact names first.
        const rank = new Map(POPULAR_SYMBOLS.map((s, i) => [s, i]));
        const score = (s: string) =>
          s === `${q}USDT` || s === q ? -2 : s.startsWith(q) ? -1 : 0;
        result = [...all]
          .filter((s) => s.includes(q))
          .sort((a, b) => {
            const sa = score(a) - score(b);
            if (sa !== 0) return sa;
            const ra = rank.get(a) ?? Infinity;
            const rb = rank.get(b) ?? Infinity;
            return ra !== rb ? ra - rb : a.localeCompare(b);
          });
      }
    }

    return result.slice(0, 100).map((s) => ({
      symbol: s,
      baseAsset: tab === "stocks" ? stockLabel(s) : s.endsWith("USDT") ? s.slice(0, -4) : s,
      quoteAsset: tab === "stocks" ? "" : s.endsWith("USDT") ? "USDT" : "",
    }));
  }, [query, lists, tab]);

  const select = (s: string) => {
    setExchange(tab === "stocks" ? "stocks" : (venueFor(s) ?? "binance"));
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
            placeholder={tab === "stocks" ? "NVDA, TSLA, Nasdaq…" : "BTC, ETH, HYPE…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
        </div>

        <ScrollArea className="h-[380px]">
          <div className="flex flex-col">
            {tab === "crypto" && allFailed && (
              <div className="flex items-center justify-between gap-3 border-b border-tv-border px-4 py-2 text-[11px] text-tv-yellow">
                <span>No se pudo cargar la lista de monedas.</span>
                <button
                  type="button"
                  onClick={() => {
                    setFailed({});
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
                {tab === "crypto" && pending && (
                  <span className="ml-1 normal-case tracking-normal text-tv-text-dim">
                    (cargando lista completa…)
                  </span>
                )}
              </div>
            )}
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                {loaded || allFailed ? "Sin resultados" : "Cargando…"}
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={s.symbol}
                onClick={() => select(s.symbol)}
                className={cn(
                  "flex items-center justify-between border-b border-tv-border px-4 py-2 text-left text-xs hover:bg-tv-panel-hover",
                  s.symbol === symbol && (tab === "stocks") === (exchange === "stocks") && "bg-tv-panel-hover",
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
                  {tab === "stocks" ? "Bolsa" : EXCHANGE_LABELS[venueFor(s.symbol) ?? "binance"]}
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
