"use client";

import { ListOrdered } from "lucide-react";
import { BRAND_NAME, LogoMark } from "@/components/brand/Logo";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { Separator } from "@/components/ui/separator";
import { useChartStore } from "@/lib/store/chart-store";

export function Header() {
  const setWatchlistOpen = useChartStore((s) => s.setWatchlistOpen);

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-tv-border bg-tv-panel px-2 md:px-3">
      {/* Logo — full on desktop, just the mark on phones */}
      <div className="flex shrink-0 items-center gap-2 pr-1 md:pr-2">
        <LogoMark className="h-7 w-7" />
        <span className="hidden text-sm font-semibold tracking-tight text-tv-text sm:inline">
          {BRAND_NAME}
        </span>
      </div>

      <Separator orientation="vertical" className="hidden h-6 bg-tv-border sm:block" />

      {/* Controls — scroll horizontally on small screens instead of wrapping */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
        <SymbolSelector />
        <Separator orientation="vertical" className="h-6 shrink-0 bg-tv-border" />
        <TimeframeSelector />
        <Separator orientation="vertical" className="mx-0.5 h-6 shrink-0 bg-tv-border" />
        <IndicatorMenu />
      </div>

      {/* Mobile: open the watchlist drawer */}
      <button
        onClick={() => setWatchlistOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded px-2 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text md:hidden"
        aria-label="Abrir watchlist"
      >
        <ListOrdered className="h-4 w-4" />
      </button>
    </header>
  );
}
