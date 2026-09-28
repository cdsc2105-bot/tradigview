"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PopoverHeading, PopoverItem, PopoverPanel } from "@/components/ui/popover-panel";
import { TIMEFRAME_BUTTONS, useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";

/** Everything else the venues serve, one click away under the chevron. */
const MORE_TIMEFRAMES: Timeframe[] = ["1m", "3m", "5m", "30m", "6h", "12h", "1w"];

/** Minutes stay lowercase ("15m"); hours and days read as "1H", "1D". */
export const timeframeLabel = (t: Timeframe) => (t.endsWith("m") ? t : t.toUpperCase());

export function TimeframeSelector() {
  const tf = useChartStore((s) => s.timeframe);
  const setTf = useChartStore((s) => s.setTimeframe);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const extra = !TIMEFRAME_BUTTONS.includes(tf);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="flex items-center gap-0.5 rounded-[7px] border border-tv-border bg-tv-surface p-0.5">
        {[...TIMEFRAME_BUTTONS, ...(extra ? [tf] : [])].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTf(t)}
            aria-pressed={tf === t}
            className={cn(
              "rounded-[5px] px-2.5 py-1 font-mono text-xs transition-colors",
              tf === t
                ? "bg-tv-panel-hover font-semibold text-tv-text"
                : "text-tv-text-muted hover:text-tv-text",
            )}
          >
            {timeframeLabel(t)}
          </button>
        ))}
      </div>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Más temporalidades"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <PopoverPanel anchor={anchor} open={open} onClose={() => setOpen(false)} className="w-40">
        <PopoverHeading>Más temporalidades</PopoverHeading>
        {MORE_TIMEFRAMES.map((t) => (
          <PopoverItem
            key={t}
            active={tf === t}
            onClick={() => {
              setTf(t);
              setOpen(false);
            }}
            className="font-mono"
          >
            {timeframeLabel(t)}
          </PopoverItem>
        ))}
      </PopoverPanel>
    </div>
  );
}
