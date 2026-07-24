"use client";

import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/**
 * Quick-zoom presets along the bottom of the chart, like TradingView's
 * 1D / 5D / 1M / … row. Each entry is how many days of history to frame.
 */
const RANGES: { label: string; days: number | "all" }[] = [
  { label: "1D", days: 1 },
  { label: "5D", days: 5 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1A", days: 365 },
  { label: "Todo", days: "all" },
];

export function RangeBar() {
  const setRange = useChartStore((s) => s.setVisibleRangeDays);
  const active = useChartStore((s) => s.visibleRangeDays);

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-t border-tv-border bg-tv-panel px-2 py-1">
      {RANGES.map((r) => (
        <button
          key={r.label}
          onClick={() => setRange(r.days)}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
            active === r.days
              ? "bg-tv-panel-hover text-tv-text"
              : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
          )}
        >
          {r.label}
        </button>
      ))}
      <Clock />
    </div>
  );
}

/** Live clock with the viewer's UTC offset, bottom-right like TradingView. */
function Clock() {
  const now = useNow();
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "−";
  const abs = Math.abs(offsetMin);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  const tz = `UTC${sign}${hh}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`;

  return (
    <span className="ml-auto shrink-0 pr-1 text-[11px] tabular-nums text-tv-text-muted">
      {now} {tz}
    </span>
  );
}

import { useEffect, useState } from "react";

function useNow(): string {
  const [t, setT] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    setT(fmt());
    const id = setInterval(() => setT(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}
