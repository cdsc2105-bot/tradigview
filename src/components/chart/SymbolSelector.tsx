"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchSupportedSymbols } from "@/lib/exchanges/symbols";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");
  const [allSymbols, setAllSymbols] = useState<string[]>([]);

  // Search the venue the chart is actually on — Bitget lists pairs (HYPEUSDT)
  // that Binance doesn't, and vice versa.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchSupportedSymbols(exchange)
      .then((set) => {
        if (!cancelled) setAllSymbols([...set].sort());
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [open, exchange]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    const base = q ? allSymbols.filter((s) => s.includes(q)) : allSymbols;
    return base.slice(0, 100).map((s) => ({
      symbol: s,
      baseAsset: s.endsWith("USDT") ? s.slice(0, -4) : s,
      quoteAsset: s.endsWith("USDT") ? "USDT" : "",
    }));
  }, [query, allSymbols]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover">
        <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">{symbol}</span>
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">
            Buscar símbolo en{" "}
            <span className="text-tv-blue">
              {exchange === "bitget" ? "Bitget Perp" : "Binance"}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="border-b border-tv-border p-3">
          <Input
            autoFocus
            placeholder="BTC, ETH, SOL…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
        </div>
        <ScrollArea className="h-[400px]">
          <div className="flex flex-col">
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Sin resultados
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={s.symbol}
                onClick={() => {
                  setSymbol(s.symbol);
                  addToWatchlist(s.symbol);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex items-center justify-between border-b border-tv-border px-4 py-2 text-left text-xs hover:bg-tv-panel-hover",
                  s.symbol === symbol && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-tv-text">{s.baseAsset}</span>
                  <span className="text-tv-text-muted">/ {s.quoteAsset}</span>
                </div>
                <span className="text-tv-text-muted">{s.symbol}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
