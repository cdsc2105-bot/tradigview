"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PopoverItem, PopoverPanel } from "@/components/ui/popover-panel";
import { fetchSupportedSymbols } from "@/lib/exchanges/symbols";
import { STOCK_SYMBOLS } from "@/lib/exchanges/stocks";
import { useChartStore, type Exchange } from "@/lib/store/chart-store";

export const MARKET_SOURCES: { key: Exchange; label: string }[] = [
  { key: "binance", label: "Binance · Spot" },
  { key: "binancef", label: "Binance · Futuros" },
  { key: "bitget", label: "Bitget · Futuros" },
  { key: "stocks", label: "Acciones · Índices" },
];

/**
 * Switch the data venue. Keeps the current pair when the new venue lists it,
 * otherwise falls back to BTC (or the S&P 500 for stocks).
 */
export function useSwitchMarket() {
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const setExchange = useChartStore((s) => s.setExchange);
  const setSymbol = useChartStore((s) => s.setSymbol);

  return async (next: Exchange) => {
    if (next === exchange) return;
    if (next === "stocks") {
      setExchange(next);
      setSymbol(STOCK_SYMBOLS[0]);
      return;
    }
    const listed = await fetchSupportedSymbols(next).catch(() => null);
    const keep = exchange !== "stocks" && (!listed || listed.has(symbol));
    setExchange(next);
    if (!keep) setSymbol("BTCUSDT");
  };
}

export function MarketSourceSelect() {
  const exchange = useChartStore((s) => s.exchange);
  const switchMarket = useSwitchMarket();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const current = MARKET_SOURCES.find((m) => m.key === exchange);

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-tv-text hover:bg-tv-panel-hover"
      >
        {current?.label}
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </button>
      <PopoverPanel anchor={anchor} open={open} onClose={() => setOpen(false)} className="w-52">
        {MARKET_SOURCES.map((m) => (
          <PopoverItem
            key={m.key}
            active={m.key === exchange}
            onClick={() => {
              setOpen(false);
              void switchMarket(m.key);
            }}
          >
            <span className="flex-1">{m.label}</span>
            {m.key === exchange && <Check className="h-3.5 w-3.5 text-tv-accent" />}
          </PopoverItem>
        ))}
      </PopoverPanel>
    </>
  );
}
