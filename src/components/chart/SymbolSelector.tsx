"use client";

import { Search } from "lucide-react";
import { baseAsset } from "@/components/brand/CoinIcon";
import { WatchlistSearch } from "@/components/watchlist/WatchlistSearch";
import { stockLabel } from "@/lib/exchanges/stocks";
import { useChartStore } from "@/lib/store/chart-store";

/**
 * Header symbol button. Opens the same search as the lists panel — every
 * venue, Todo / Cripto / Acciones, tokenized stocks included — in "open on
 * chart" mode, as CdeCripto does.
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
        aria-label="Buscar moneda"
        className="group flex h-[30px] w-24 shrink-0 items-center gap-2 rounded-[7px] border border-tv-border bg-tv-surface px-2.5 text-[13px] font-semibold text-tv-text transition-colors hover:border-tv-border-strong md:w-28"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-tv-text-muted group-hover:text-tv-text" />
        <span className="truncate">
          {exchange === "stocks" ? stockLabel(symbol) : baseAsset(symbol)}
        </span>
      </button>
      {open && <WatchlistSearch target={{ mode: "chart" }} onClose={() => setOpen(false)} />}
    </>
  );
}
