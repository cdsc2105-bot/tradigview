"use client";

import { LAYOUT_LABELS, useChartStore, type LayoutKey } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

const LAYOUTS = Object.keys(LAYOUT_LABELS) as LayoutKey[];

/** Segmented VWAP / Normal switch — each layout keeps its own indicators. */
export function LayoutSwitch() {
  const layout = useChartStore((s) => s.layout);
  const setLayout = useChartStore((s) => s.setLayout);
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-[7px] border border-tv-border bg-tv-surface p-0.5">
      {LAYOUTS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLayout(l)}
          aria-pressed={layout === l}
          className={cn(
            "rounded-[5px] px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors",
            layout === l
              ? "bg-tv-panel-hover text-tv-text"
              : "text-tv-text-muted hover:text-tv-text",
          )}
        >
          {LAYOUT_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
