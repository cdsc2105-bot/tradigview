"use client";

import { useSyncExternalStore } from "react";

/** One shared 1s ticker for every subscriber. */
function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1_000);
  return () => clearInterval(id);
}

const clockNow = () =>
  new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

/** The viewer's UTC offset, "UTC", "UTC-5" or "UTC+5:30". */
function tzLabel(): string {
  const offsetMin = -new Date().getTimezoneOffset();
  if (offsetMin === 0) return "UTC";
  const abs = Math.abs(offsetMin);
  const mm = abs % 60;
  return `UTC${offsetMin > 0 ? "+" : "-"}${Math.floor(abs / 60)}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`;
}

/** Local clock stacked over the timezone, tucked under the price axis. */
export function ChartClock() {
  const now = useSyncExternalStore(subscribe, clockNow, () => "");
  const tz = useSyncExternalStore(subscribe, tzLabel, () => "");
  return (
    <div className="pointer-events-none absolute bottom-0 right-0 z-10 flex w-[64px] flex-col items-center justify-center py-1 font-mono text-[11px] leading-tight text-tv-text-muted">
      <span className="tabular-nums">{now}</span>
      <span className="text-[10px]">{tz}</span>
    </div>
  );
}
