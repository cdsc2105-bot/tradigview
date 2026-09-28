"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { CoinIcon } from "@/components/brand/CoinIcon";
import { fetchTickers24h } from "@/lib/binance/rest";
import { fetchBitgetTickers } from "@/lib/exchanges/bitget";
import { fetchFuturesTickers } from "@/lib/exchanges/binance-futures";
import { getBitgetWS } from "@/lib/exchanges/bitget-ws";
import { fetchStockTickers, stockLabel } from "@/lib/exchanges/stocks";
import { fetchSupportedSymbols } from "@/lib/exchanges/symbols";
import { getBinanceWS, getBinanceFuturesWS } from "@/lib/binance/ws";
import { useChartStore, type Exchange } from "@/lib/store/chart-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPriceFor } from "@/lib/precision";
import { cn } from "@/lib/utils";

interface Row {
  price: number;
  pct: number;
}

type RowMap = Record<string, Row>;

/** Watchlist rows repaint at most this often, however fast ticks arrive. */
const FLUSH_MS = 250;

/**
 * Live 24h price + change for `symbols` on one venue: a REST snapshot for
 * instant numbers, then the venue's stream (or a poll, for stocks). Ticks are
 * buffered and flushed a few times a second so a busy market never floods
 * React with renders.
 */
function useVenueTickers(exchange: Exchange, symbols: string[]): RowMap {
  const [rows, setRows] = useState<RowMap>({});
  const key = symbols.join(",");

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    let pending: RowMap = {};
    let timer: ReturnType<typeof setTimeout> | null = null;

    const push = (symbol: string, row: Row) => {
      pending[symbol] = row;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (cancelled) return;
        const batch = pending;
        pending = {};
        setRows((prev) => ({ ...prev, ...batch }));
      }, FLUSH_MS);
    };

    const snapshot = (
      tickers: { symbol: string; lastPrice: number; priceChangePercent: number }[],
    ) => {
      if (cancelled) return;
      const next: RowMap = {};
      for (const t of tickers) next[t.symbol] = { price: t.lastPrice, pct: t.priceChangePercent };
      setRows((prev) => ({ ...prev, ...next }));
    };

    // Stream ticks keep this fresh; if none arrive for a while (WebSocket
    // blocked on this network), fall back to polling the REST snapshot.
    let lastTick = Date.now();
    const pollIfSilent = (load: () => void) => {
      const id = setInterval(() => {
        if (!document.hidden && Date.now() - lastTick > 8_000) load();
      }, 5_000);
      return () => clearInterval(id);
    };

    let stop: () => void = () => {};
    if (exchange === "binance" || exchange === "binancef") {
      const fetcher = exchange === "binance" ? fetchTickers24h : fetchFuturesTickers;
      const load = () => void fetcher(symbols).then(snapshot).catch(console.error);
      load();
      const ws = exchange === "binance" ? getBinanceWS() : getBinanceFuturesWS();
      const unsub = ws.subscribeMiniTickers(symbols, (t) => {
        lastTick = Date.now();
        push(t.symbol, { price: t.close, pct: t.pct });
      });
      const stopPoll = pollIfSilent(load);
      stop = () => {
        unsub();
        stopPoll();
      };
    } else if (exchange === "bitget") {
      const load = () => void fetchBitgetTickers(symbols).then(snapshot).catch(console.error);
      load();
      const unsub = getBitgetWS().subscribeTickers(symbols, (t) => {
        lastTick = Date.now();
        push(t.symbol, { price: t.lastPrice, pct: t.priceChangePercent });
      });
      const stopPoll = pollIfSilent(load);
      stop = () => {
        unsub();
        stopPoll();
      };
    } else {
      // Stocks: no free stream — poll; Yahoo is rate-limited, 5s is plenty.
      const load = () => fetchStockTickers(symbols).then(snapshot).catch(console.error);
      void load();
      const id = setInterval(load, 5_000);
      stop = () => clearInterval(id);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stop();
    };
    // `key` stands in for `symbols` (a new array every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange, key]);

  return rows;
}

export function Watchlist() {
  const watchlist = useChartStore((s) => s.watchlist);
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useChartStore((s) => s.removeFromWatchlist);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);
  const setWatchlistOpen = useChartStore((s) => s.setWatchlistOpen);

  const [supported, setSupported] = useState<{ exchange: Exchange; set: Set<string> } | null>(
    null,
  );
  const [collapsed, setCollapsed] = useState(false);
  /** Venue whose symbol list failed to load, and a bump to retry it */
  const [failedFor, setFailedFor] = useState<Exchange | null>(null);
  const [retry, setRetry] = useState(0);

  // Only the active market's list is loaded — one venue, not four, on startup.
  useEffect(() => {
    let cancelled = false;
    fetchSupportedSymbols(exchange)
      .then((set) => {
        if (!cancelled) setSupported({ exchange, set });
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setFailedFor(exchange);
      });
    return () => {
      cancelled = true;
    };
  }, [exchange, retry]);

  const set = supported?.exchange === exchange ? supported.set : null;
  const symbols = useMemo(
    () => (set ? watchlist.filter((s) => set.has(s)) : []),
    [watchlist, set],
  );
  const rows = useVenueTickers(exchange, symbols);
  const isStocks = exchange === "stocks";
  const inList = watchlist.includes(symbol);

  const select = (s: string) => {
    setSymbol(s);
    setWatchlistOpen(false); // close the mobile drawer after picking
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-tv-border px-4">
        <h2 className="text-[15px] font-semibold text-tv-text">Favoritos</h2>
        <button
          type="button"
          onClick={() => openSymbolDialog(true)}
          className="rounded-md p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Agregar moneda"
          aria-label="Agregar moneda"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="grid shrink-0 grid-cols-[1fr_auto_4rem] gap-2 px-4 pb-1 pt-2 text-[11px] text-tv-text-muted">
        <span>Símbolo</span>
        <span className="text-right">Última</span>
        <span className="text-right">Cambio%</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-tv-text-muted hover:text-tv-text"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")} />
            {isStocks ? "Acciones e índices" : "Cripto"}
            <span className="ml-auto rounded-full bg-tv-surface px-1.5 text-[10px] font-medium tracking-normal">
              {set ? symbols.length : "…"}
            </span>
          </button>

          {!collapsed && !set && failedFor === exchange && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs text-tv-yellow">
              <span>No se pudo cargar este mercado.</span>
              <button
                type="button"
                onClick={() => {
                  setFailedFor(null);
                  setRetry((r) => r + 1);
                }}
                className="rounded border border-tv-border px-2 py-0.5 text-tv-text hover:bg-tv-panel-hover"
              >
                Reintentar
              </button>
            </div>
          )}
          {!collapsed && !set && failedFor !== exchange && (
            <div className="px-2.5 py-2 text-xs text-tv-text-dim">Cargando…</div>
          )}
          {!collapsed && set && symbols.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-tv-text-dim">
              Sin monedas de este mercado. Toca + para agregar.
            </div>
          )}

          {!collapsed &&
            symbols.map((s) => {
              const row = rows[s];
              const active = s === symbol;
              return (
                <div
                  key={s}
                  role="button"
                  tabIndex={0}
                  onClick={() => select(s)}
                  onKeyDown={(e) => e.key === "Enter" && select(s)}
                  className={cn(
                    "group relative grid h-7 cursor-pointer grid-cols-[1fr_auto_4rem] items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors",
                    active
                      ? "border-tv-border-strong bg-tv-panel-hover"
                      : "border-transparent hover:bg-tv-panel-hover",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <CoinIcon symbol={s} />
                    <span className="truncate font-medium text-tv-text">
                      {isStocks ? stockLabel(s) : s}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlist(s);
                    }}
                    className="absolute -left-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-tv-surface p-0.5 text-tv-text-muted ring-1 ring-tv-border hover:text-tv-red group-hover:block"
                    aria-label={`Quitar ${s} de favoritos`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                  <span className="text-right font-mono text-xs tabular-nums text-tv-text">
                    {row ? formatPriceFor(exchange, s, row.price) : "—"}
                  </span>
                  <span
                    className={cn(
                      "text-right font-mono text-xs tabular-nums",
                      !row ? "text-tv-text-dim" : row.pct >= 0 ? "text-tv-green" : "text-tv-red",
                    )}
                  >
                    {row ? `${row.pct >= 0 ? "+" : ""}${row.pct.toFixed(2)}%` : "—"}
                  </span>
                </div>
              );
            })}
        </div>
      </ScrollArea>

      {/* Current symbol, with quick search / add */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-t border-tv-border px-4">
        <CoinIcon symbol={symbol} />
        <span className="flex-1 truncate text-[13px] font-semibold text-tv-text">
          {isStocks ? stockLabel(symbol) : symbol}
        </span>
        <button
          type="button"
          onClick={() => openSymbolDialog(true)}
          className="rounded-md p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Buscar moneda"
          aria-label="Buscar moneda"
        >
          <Search className="h-4 w-4" />
        </button>
        {!inList && (
          <button
            type="button"
            onClick={() => addToWatchlist(symbol)}
            className="rounded-md p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            title="Agregar a favoritos"
            aria-label="Agregar a favoritos"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <a
        href="https://www.tradingview.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 px-4 pb-2 text-[10px] text-tv-text-dim hover:text-tv-text-muted"
      >
        Gráficos con Lightweight Charts™ de TradingView
      </a>
    </div>
  );
}
