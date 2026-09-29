"use client";

import { Search, ChevronDown } from "lucide-react";
import { WatchlistSearch } from "@/components/watchlist/WatchlistSearch";
import { tickerOf } from "@/lib/exchanges/catalog";
import { useChartStore } from "@/lib/store/chart-store";

/**
 * Header symbol button. Opens the same search as the watchlist (every venue,
 * Todo / Cripto / Acciones, tokenized stocks included) in "open on chart" mode.
 */
export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Buscar símbolo"
        className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover"
      >
        <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">
          {exchange === "stocks" ? tickerOf(exchange, symbol) : symbol}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </button>
      {open && <WatchlistSearch target={{ mode: "chart" }} onClose={() => setOpen(false)} />}
    </>
  );
}
