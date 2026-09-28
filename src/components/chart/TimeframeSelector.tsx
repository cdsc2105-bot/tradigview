"use client";

import { TIMEFRAME_BUTTONS, useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";

/** Minutes stay lowercase ("15m"); hours and days read as "1H", "1D". */
const labelOf = (t: Timeframe) => (t.endsWith("m") ? t : t.toUpperCase());

export function TimeframeSelector() {
  const tf = useChartStore((s) => s.timeframe);
  const setTf = useChartStore((s) => s.setTimeframe);
  return (
    <div className="flex items-center gap-0.5 rounded bg-tv-bg p-0.5">
      {TIMEFRAME_BUTTONS.map((t) => (
        <button
          key={t}
          onClick={() => setTf(t)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            tf === t
              ? "bg-tv-panel-hover text-tv-text"
              : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
          )}
        >
          {labelOf(t)}
        </button>
      ))}
    </div>
  );
}
