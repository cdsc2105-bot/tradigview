"use client";

import { useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import { PopoverHeading, PopoverPanel } from "@/components/ui/popover-panel";
import { ALL_TIMEFRAMES, useChartStore } from "@/lib/store/chart-store";
import type { Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";

/** Minutes stay lowercase ("15m"); hours and days read as "1H", "1D". */
export const timeframeLabel = (t: Timeframe) => (t.endsWith("m") ? t : t.toUpperCase());

const GROUPS: { title: string; match: (t: Timeframe) => boolean }[] = [
  { title: "Minutos", match: (t) => t.endsWith("m") },
  { title: "Horas", match: (t) => t.endsWith("h") },
  { title: "Días y semanas", match: (t) => t.endsWith("d") || t.endsWith("w") },
];

/**
 * Starred timeframes as buttons; every timeframe in the dropdown with a star
 * to add it to (or remove it from) the bar. The current timeframe always
 * shows, starred or not.
 */
export function TimeframeSelector() {
  const tf = useChartStore((s) => s.timeframe);
  const setTf = useChartStore((s) => s.setTimeframe);
  const favorites = useChartStore((s) => s.favoriteTimeframes);
  const toggleFavorite = useChartStore((s) => s.toggleFavoriteTimeframe);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const buttons = ALL_TIMEFRAMES.filter((t) => favorites.includes(t) || t === tf);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="flex items-center gap-0.5 rounded-[7px] border border-tv-border bg-tv-surface p-0.5">
        {buttons.map((t) => (
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
        aria-label="Todas las temporalidades"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <PopoverPanel anchor={anchor} open={open} onClose={() => setOpen(false)} className="w-52">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <PopoverHeading>{g.title}</PopoverHeading>
            {ALL_TIMEFRAMES.filter(g.match).map((t) => {
              const starred = favorites.includes(t);
              return (
                <div
                  key={t}
                  className={cn(
                    "flex items-center rounded-md transition-colors hover:bg-tv-panel-hover",
                    tf === t && "bg-tv-panel-hover",
                  )}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTf(t);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex-1 px-2.5 py-1.5 text-left font-mono text-[13px]",
                      tf === t ? "text-tv-text" : "text-tv-text-muted hover:text-tv-text",
                    )}
                  >
                    {timeframeLabel(t)}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(t)}
                    aria-pressed={starred}
                    title={starred ? "Quitar de la barra" : "Agregar a la barra"}
                    aria-label={`${starred ? "Quitar" : "Agregar"} ${timeframeLabel(t)} ${starred ? "de" : "a"} la barra`}
                    className="mr-1 rounded p-1.5 hover:bg-tv-surface"
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        starred ? "fill-tv-yellow text-tv-yellow" : "text-tv-text-dim",
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </PopoverPanel>
    </div>
  );
}
