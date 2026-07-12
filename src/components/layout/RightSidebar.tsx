"use client";

import { X } from "lucide-react";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { useChartStore } from "@/lib/store/chart-store";

export function RightSidebar() {
  const open = useChartStore((s) => s.watchlistOpen);
  const setOpen = useChartStore((s) => s.setWatchlistOpen);

  return (
    <>
      {/* Desktop: static column */}
      <aside className="hidden w-64 flex-col border-l border-tv-border bg-tv-panel md:flex">
        <Watchlist />
      </aside>

      {/* Mobile: slide-over drawer — mounted only when open so there is no
          stale-transform / off-screen-overlay state to fight with */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            onClick={() => setOpen(false)}
            className="absolute inset-0 animate-fade-in bg-black/60"
          />
          <aside className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-tv-border bg-tv-panel shadow-xl">
            <div className="flex items-center justify-between border-b border-tv-border px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-tv-text-muted">
                Mercados
              </span>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                aria-label="Cerrar watchlist"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Watchlist />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
