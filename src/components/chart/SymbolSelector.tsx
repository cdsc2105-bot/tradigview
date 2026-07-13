"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchSupportedSymbols } from "@/lib/exchanges/symbols";
import { useChartStore, type Exchange } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

const TABS: { key: Exchange; label: string }[] = [
  { key: "binance", label: "Binance" },
  { key: "bitget", label: "Bitget Perp" },
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

  // When the dialog opens, sync the tab to the current exchange.
  useEffect(() => {
    if (open) setTab(exchange);
  }, [open, exchange]);

  // Load the symbol list for the active tab (each venue lists different pairs —
  // HYPEUSDT / Hyperliquid is Bitget-only, for instance).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchSupportedSymbols(tab)
      .then((set) => {
        if (!cancelled)
          setSymbolsByExchange((prev) => ({ ...prev, [tab]: [...set].sort() }));
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [open, tab]);

  const filtered = useMemo(() => {
    const list = symbolsByExchange[tab] ?? [];
    const q = query.trim().toUpperCase();
    const base = q ? list.filter((s) => s.includes(q)) : list;
    return base.slice(0, 100).map((s) => ({
      symbol: s,
      baseAsset: s.endsWith("USDT") ? s.slice(0, -4) : s,
      quoteAsset: s.endsWith("USDT") ? "USDT" : "",
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
        className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover"
      >
        <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">{symbol}</span>
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </button>
      {/* Conditionally mounted so it fully closes (base-ui's exit animation
          lingers with this app's Tailwind setup). */}
      {open ? (
      <Dialog open onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-md gap-0 bg-tv-panel p-0"
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
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                {symbolsByExchange[tab] ? "Sin resultados" : "Cargando…"}
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
                  <span className="font-semibold text-tv-text">{s.baseAsset}</span>
                  <span className="text-tv-text-muted">/ {s.quoteAsset}</span>
                </div>
                <span className="text-[10px] text-tv-text-dim">
                  {tab === "bitget" ? "Bitget" : "Binance"}
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
