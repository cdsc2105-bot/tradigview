"use client";

import { Code2, Zap, ListOrdered } from "lucide-react";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { Separator } from "@/components/ui/separator";
import { CHART_MODES, useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

export function Header() {
  const setWatchlistOpen = useChartStore((s) => s.setWatchlistOpen);
  const mode = useChartStore((s) => s.mode);
  const setMode = useChartStore((s) => s.setMode);

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-tv-border bg-tv-panel px-2 md:px-3">
      {/* Logo — full on desktop, just the mark on phones */}
      <div className="flex shrink-0 items-center gap-2 pr-1 md:pr-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-tv-blue/20">
          <Zap className="h-4 w-4 text-tv-blue" />
        </div>
        <span className="hidden text-sm font-semibold text-tv-text sm:inline">
          Trading
        </span>
      </div>

      <Separator orientation="vertical" className="hidden h-6 bg-tv-border sm:block" />

      {/* Controls — scroll horizontally on small screens instead of wrapping */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
        {/* VWAP / NORMAL — each view keeps its own timeframe and indicators */}
        <nav
          aria-label="Secciones principales"
          className="flex shrink-0 items-center rounded-md bg-tv-bg p-0.5"
        >
          {CHART_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              aria-current={mode === m.key ? "page" : undefined}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors",
                mode === m.key
                  ? "bg-tv-blue text-white"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              {m.label}
            </button>
          ))}
        </nav>
        <Separator orientation="vertical" className="h-6 shrink-0 bg-tv-border" />
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

      <a
        href="https://github.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text md:flex"
      >
        <Code2 className="h-3.5 w-3.5" />
        <span>Source</span>
      </a>
    </header>
  );
}
