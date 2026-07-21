"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, X } from "lucide-react";
import { fetchTickers24h } from "@/lib/binance/rest";
import { fetchBitgetTickers } from "@/lib/exchanges/bitget";
import { fetchFuturesTickers } from "@/lib/exchanges/binance-futures";
import { getBitgetWS } from "@/lib/exchanges/bitget-ws";
import { fetchStockTickers, stockLabel } from "@/lib/exchanges/stocks";
import { fetchSupportedSymbols } from "@/lib/exchanges/symbols";
import { getBinanceWS, getBinanceFuturesWS } from "@/lib/binance/ws";
import { useChartStore, type Exchange } from "@/lib/store/chart-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPct } from "@/lib/format";
import { formatPriceFor } from "@/lib/precision";
import { cn } from "@/lib/utils";

interface Row {
  price: number;
  pct: number;
}

/** Key rows by "exchange:symbol" so Binance and Bitget don't collide. */
type RowMap = Record<string, Row>;

const rk = (exchange: Exchange, symbol: string) => `${exchange}:${symbol}`;

const SECTIONS: { key: Exchange; label: string; dot: string }[] = [
  { key: "binance", label: "Binance", dot: "bg-tv-yellow" },
  { key: "binancef", label: "Binance Perp", dot: "bg-tv-green" },
  { key: "bitget", label: "Bitget Perp", dot: "bg-tv-blue" },
  { key: "stocks", label: "Acciones e índices", dot: "bg-tv-purple" },
];

export function Watchlist() {
  const watchlist = useChartStore((s) => s.watchlist);
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const setExchange = useChartStore((s) => s.setExchange);
  const removeFromWatchlist = useChartStore((s) => s.removeFromWatchlist);
  const openSymbolDialog = useChartStore((s) => s.setSymbolDialogOpen);
  const setWatchlistOpen = useChartStore((s) => s.setWatchlistOpen);

  const [rows, setRows] = useState<RowMap>({});
  const [flash, setFlash] = useState<Record<string, "up" | "down" | null>>({});
  const [collapsed, setCollapsed] = useState<Partial<Record<Exchange, boolean>>>({});
  /** Column sort, TradingView-style — click a header to sort by it */
  const [sort, setSort] = useState<{
    key: "symbol" | "price" | "pct";
    dir: "asc" | "desc";
  }>({ key: "symbol", dir: "asc" });
  const [supported, setSupported] = useState<
    Record<Exchange, Set<string> | null>
  >({ binance: null, binancef: null, bitget: null, stocks: null });

  // Which watchlist symbols each venue actually lists. Binance's batch ticker
  // endpoint 400s the whole request on a single unknown symbol, so this gate
  // must resolve before any ticker fetch runs.
  useEffect(() => {
    let cancelled = false;
    SECTIONS.forEach(({ key }) => {
      fetchSupportedSymbols(key)
        .then((set) => {
          if (!cancelled) setSupported((prev) => ({ ...prev, [key]: set }));
        })
        .catch(console.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const listed = useMemo(() => {
    const pick = (ex: Exchange) => {
      const set = supported[ex];
      return set ? watchlist.filter((s) => set.has(s)) : [];
    };
    return {
      binance: pick("binance"),
      binancef: pick("binancef"),
      bitget: pick("bitget"),
      stocks: pick("stocks"),
    };
  }, [watchlist, supported]);

  const binanceSymbols = listed.binance;
  const futuresSymbols = listed.binancef;
  const bitgetSymbols = listed.bitget;
  const stockSymbols = listed.stocks;
  const binanceKey = binanceSymbols.join(",");
  const futuresKey = futuresSymbols.join(",");
  const bitgetKey = bitgetSymbols.join(",");
  const stocksKey = stockSymbols.join(",");

  // Binance: REST snapshot + live WebSocket mini-tickers
  useEffect(() => {
    if (binanceSymbols.length === 0) return;
    let cancelled = false;

    fetchTickers24h(binanceSymbols)
      .then((tickers) => {
        if (cancelled) return;
        setRows((prev) => {
          const next = { ...prev };
          tickers.forEach((t) => {
            next[rk("binance", t.symbol)] = {
              price: t.lastPrice,
              pct: t.priceChangePercent,
            };
          });
          return next;
        });
      })
      .catch(console.error);

    const ws = getBinanceWS();
    const unsub = ws.subscribeMiniTickers(binanceSymbols, (tick) => {
      const key = rk("binance", tick.symbol);
      setRows((prev) => {
        const prevRow = prev[key];
        if (prevRow) {
          if (tick.close > prevRow.price) {
            setFlash((f) => ({ ...f, [key]: "up" }));
            setTimeout(() => setFlash((f) => ({ ...f, [key]: null })), 300);
          } else if (tick.close < prevRow.price) {
            setFlash((f) => ({ ...f, [key]: "down" }));
            setTimeout(() => setFlash((f) => ({ ...f, [key]: null })), 300);
          }
        }
        return { ...prev, [key]: { price: tick.close, pct: tick.pct } };
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binanceKey]);

  // Binance Perp: REST snapshot + live WebSocket mini-tickers (fstream host)
  useEffect(() => {
    if (futuresSymbols.length === 0) return;
    let cancelled = false;

    fetchFuturesTickers(futuresSymbols)
      .then((tickers) => {
        if (cancelled) return;
        setRows((prev) => {
          const next = { ...prev };
          tickers.forEach((t) => {
            next[rk("binancef", t.symbol)] = {
              price: t.lastPrice,
              pct: t.priceChangePercent,
            };
          });
          return next;
        });
      })
      .catch(console.error);

    const ws = getBinanceFuturesWS();
    const unsub = ws.subscribeMiniTickers(futuresSymbols, (tick) => {
      const key = rk("binancef", tick.symbol);
      setRows((prev) => {
        const prevRow = prev[key];
        if (prevRow) {
          if (tick.close > prevRow.price) {
            setFlash((f) => ({ ...f, [key]: "up" }));
            setTimeout(() => setFlash((f) => ({ ...f, [key]: null })), 300);
          } else if (tick.close < prevRow.price) {
            setFlash((f) => ({ ...f, [key]: "down" }));
            setTimeout(() => setFlash((f) => ({ ...f, [key]: null })), 300);
          }
        }
        return { ...prev, [key]: { price: tick.close, pct: tick.pct } };
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [futuresKey]);

  // Bitget: one REST snapshot for instant data, then real-time WebSocket ticks
  // (sub-second, ~0.35s) instead of polling.
  useEffect(() => {
    if (bitgetSymbols.length === 0) return;
    let cancelled = false;

    fetchBitgetTickers(bitgetSymbols)
      .then((tickers) => {
        if (cancelled) return;
        setRows((prev) => {
          const next = { ...prev };
          tickers.forEach((t) => {
            next[rk("bitget", t.symbol)] = {
              price: t.lastPrice,
              pct: t.priceChangePercent,
            };
          });
          return next;
        });
      })
      .catch(console.error);

    const ws = getBitgetWS();
    const unsub = ws.subscribeTickers(bitgetSymbols, (t) => {
      const key = rk("bitget", t.symbol);
      setRows((prev) => {
        const prevRow = prev[key];
        if (prevRow) {
          if (t.lastPrice > prevRow.price) {
            setFlash((f) => ({ ...f, [key]: "up" }));
            setTimeout(() => setFlash((f) => ({ ...f, [key]: null })), 300);
          } else if (t.lastPrice < prevRow.price) {
            setFlash((f) => ({ ...f, [key]: "down" }));
            setTimeout(() => setFlash((f) => ({ ...f, [key]: null })), 300);
          }
        }
        return { ...prev, [key]: { price: t.lastPrice, pct: t.priceChangePercent } };
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitgetKey]);

  // Stocks & indices: no free WebSocket, so poll. Equities move slower than
  // crypto and Yahoo is rate-limited, so 5s is the sweet spot.
  useEffect(() => {
    if (stockSymbols.length === 0) return;
    let cancelled = false;

    const load = () => {
      fetchStockTickers(stockSymbols)
        .then((tickers) => {
          if (cancelled) return;
          setRows((prev) => {
            const next = { ...prev };
            tickers.forEach((t) => {
              const key = rk("stocks", t.symbol);
              const prevRow = prev[key];
              if (prevRow && t.lastPrice !== prevRow.price) {
                const dir = t.lastPrice > prevRow.price ? "up" : "down";
                setFlash((f) => ({ ...f, [key]: dir }));
                setTimeout(() => setFlash((f) => ({ ...f, [key]: null })), 300);
              }
              next[key] = { price: t.lastPrice, pct: t.priceChangePercent };
            });
            return next;
          });
        })
        .catch(console.error);
    };

    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocksKey]);

  /** Order a section's symbols by the active column. */
  const sortRows = (symbols: string[], ex: Exchange) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...symbols].sort((a, b) => {
      if (sort.key === "symbol") return a.localeCompare(b) * dir;
      const ra = rows[rk(ex, a)];
      const rb = rows[rk(ex, b)];
      // Rows still waiting on their first tick sink to the bottom
      if (!ra && !rb) return 0;
      if (!ra) return 1;
      if (!rb) return -1;
      const va = sort.key === "price" ? ra.price : ra.pct;
      const vb = sort.key === "price" ? rb.price : rb.pct;
      return (va - vb) * dir;
    });
  };

  const select = (ex: Exchange, s: string) => {
    setExchange(ex);
    setSymbol(s);
    setWatchlistOpen(false); // close the mobile drawer after picking
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-tv-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Watchlist
        </h2>
        <button
          onClick={() => openSymbolDialog(true)}
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          title="Agregar símbolo"
          aria-label="Agregar al watchlist"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid shrink-0 grid-cols-[1fr_auto_auto] gap-2 border-b border-tv-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
        {(
          [
            ["symbol", "Símbolo", "text-left"],
            ["price", "Precio", "text-right"],
            ["pct", "24h", "text-right"],
          ] as const
        ).map(([key, label, align]) => (
          <button
            key={key}
            onClick={() =>
              setSort((s) =>
                s.key === key
                  ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
                  : { key, dir: key === "symbol" ? "asc" : "desc" },
              )
            }
            className={cn(
              "flex items-center gap-0.5 uppercase transition-colors hover:text-tv-text",
              align,
              align === "text-right" && "justify-end",
              sort.key === key && "text-tv-text",
            )}
          >
            {label}
            {sort.key === key &&
              (sort.dir === "asc" ? (
                <ArrowUp className="h-2.5 w-2.5" />
              ) : (
                <ArrowDown className="h-2.5 w-2.5" />
              ))}
          </button>
        ))}
      </div>
      {/* min-h-0 is what lets this shrink inside the flex column — without it the
          list grows past the sidebar and the scrollbar never appears */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
          {watchlist.length === 0 && (
            <div className="p-4 text-center text-xs text-tv-text-muted">
              Tu watchlist está vacío
            </div>
          )}
          {SECTIONS.map((section) => {
            const symbols = listed[section.key];
            const loading = supported[section.key] === null;
            const isCollapsed = collapsed[section.key] ?? false;
            return (
              <div key={section.key}>
                <button
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [section.key]: !isCollapsed }))
                  }
                  className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-tv-border bg-tv-bg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-tv-text-dim hover:text-tv-text"
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? "Expandir" : "Colapsar"} ${section.label}`}
                >
                  <span
                    className={cn("inline-flex h-1.5 w-1.5 rounded-full", section.dot)}
                  />
                  {section.label}
                  <span className="ml-auto flex items-center gap-1.5 normal-case tracking-normal">
                    {!loading && symbols.length}
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform",
                        isCollapsed && "-rotate-90",
                      )}
                    />
                  </span>
                </button>

                {loading && !isCollapsed && (
                  <div className="px-3 py-2 text-[11px] text-tv-text-dim">
                    Cargando símbolos…
                  </div>
                )}

                {!isCollapsed && sortRows(symbols, section.key).map((s) => {
                  const key = rk(section.key, s);
                  const row = rows[key];
                  const isActive = s === symbol && section.key === exchange;
                  const f = flash[key];
                  return (
                    <div
                      key={key}
                      onClick={() => select(section.key, s)}
                      className={cn(
                        "group grid cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                        "hover:bg-tv-panel-hover",
                        isActive && "bg-tv-panel-hover",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <span className="h-3 w-0.5 rounded-full bg-tv-blue" />
                        )}
                        <span className="font-medium text-tv-text">
                          {section.key === "stocks"
                            ? stockLabel(s)
                            : s.replace("USDT", "")}
                        </span>
                        {section.key !== "stocks" && (
                          <span className="text-[10px] text-tv-text-dim">USDT</span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-right tabular-nums transition-colors",
                          f === "up" && "text-tv-green",
                          f === "down" && "text-tv-red",
                          !f && "text-tv-text",
                        )}
                      >
                        {row ? formatPriceFor(section.key, s, row.price) : "—"}
                      </span>
                      <div className="flex items-center justify-end gap-1">
                        <span
                          className={cn(
                            "rounded px-1 py-0.5 text-[11px] font-medium tabular-nums",
                            row
                              ? row.pct >= 0
                                ? "bg-tv-green/10 text-tv-green"
                                : "bg-tv-red/10 text-tv-red"
                              : "text-tv-text-muted",
                          )}
                        >
                          {row ? formatPct(row.pct) : "—"}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromWatchlist(s);
                          }}
                          className="invisible rounded p-0.5 text-tv-text-muted hover:bg-tv-bg hover:text-tv-red group-hover:visible"
                          aria-label={`Quitar ${s} del watchlist`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
