"use client";

import { useChartStore, type Exchange } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

const EXCHANGES: { key: Exchange; label: string }[] = [
  { key: "binance", label: "Binance" },
  { key: "bitget", label: "Bitget" },
];

export function ExchangeSelector() {
  const exchange = useChartStore((s) => s.exchange);
  const setExchange = useChartStore((s) => s.setExchange);
  return (
    <div className="flex items-center gap-0.5 rounded bg-tv-bg p-0.5">
      {EXCHANGES.map((e) => (
        <button
          key={e.key}
          onClick={() => setExchange(e.key)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            exchange === e.key
              ? "bg-tv-panel-hover text-tv-text"
              : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
          )}
        >
          {e.label}
        </button>
      ))}
    </div>
  );
}
