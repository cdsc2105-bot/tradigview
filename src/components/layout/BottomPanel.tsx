"use client";

import { useEffect, useState } from "react";
import { useChartStore, EXCHANGE_LABELS } from "@/lib/store/chart-store";
import { fetchTicker24h } from "@/lib/binance/rest";
import { fetchBitgetTicker } from "@/lib/exchanges/bitget";
import { fetchFuturesTickers } from "@/lib/exchanges/binance-futures";
import type { Ticker24h } from "@/lib/binance/types";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BottomPanel() {
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const [t, setT] = useState<Ticker24h | null>(null);

  useEffect(() => {
    let cancelled = false;
    setT(null);
    const load = () => {
      const p =
        exchange === "bitget"
          ? fetchBitgetTicker(symbol)
          : exchange === "binancef"
            ? fetchFuturesTickers([symbol]).then((r) => r[0])
            : fetchTicker24h(symbol);
      p.then((x) => {
        if (!cancelled && x) setT(x);
      }).catch(console.error);
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, exchange]);

  const upClass = (n: number) => (n >= 0 ? "text-tv-green" : "text-tv-red");

  return (
    <div className="flex h-9 shrink-0 items-center gap-0 overflow-x-auto border-t border-tv-border bg-tv-panel px-2 text-xs scrollbar-none md:px-3">
      <Stat label="Símbolo" value={symbol} />
      <Stat
        label="24h Cambio"
        value={t ? formatPct(t.priceChangePercent) : "—"}
        valueClass={t ? upClass(t.priceChangePercent) : ""}
      />
      <Stat
        label="24h Alto"
        value={t ? formatPrice(t.highPrice) : "—"}
        valueClass="text-tv-green"
      />
      <Stat
        label="24h Bajo"
        value={t ? formatPrice(t.lowPrice) : "—"}
        valueClass="text-tv-red"
      />
      <Stat
        label="24h Vol (base)"
        value={t ? formatVolume(t.volume) : "—"}
      />
      <Stat
        label="24h Vol (USDT)"
        value={t ? formatVolume(t.quoteVolume) : "—"}
      />
      <div className="ml-auto flex shrink-0 items-center gap-2 pl-3 text-[10px] text-tv-text-dim">
        <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tv-green" />
        <span>{EXCHANGE_LABELS[exchange]} · Live</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-r border-tv-border px-3">
      <span className="text-tv-text-dim">{label}</span>
      <span className={cn("font-medium tabular-nums", valueClass ?? "text-tv-text")}>
        {value}
      </span>
    </div>
  );
}
