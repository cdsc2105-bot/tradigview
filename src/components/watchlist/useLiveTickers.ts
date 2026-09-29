"use client";

import { useEffect, useMemo, useState } from "react";
import { getBitgetWS } from "@/lib/exchanges/bitget-ws";
import { fetchSupportedSymbols } from "@/lib/exchanges/symbols";
import { TICKER_FETCHERS } from "@/lib/exchanges/venues";
import { getBinanceWS, getBinanceFuturesWS } from "@/lib/binance/ws";
import type { Exchange } from "@/lib/store/chart-store";
import { itemKey, type SymbolItem } from "@/lib/watchlist/lists";

export interface TickerRow {
  price: number;
  /** Absolute 24h change — the "Cbo" column */
  chg: number;
  pct: number;
}

export type TickerMap = Record<string, TickerRow>;

/** Rows repaint at most this often, however fast ticks arrive. */
const FLUSH_MS = 250;

/**
 * Live 24h price + change for `symbols` on one venue: a REST snapshot for
 * instant numbers, then the venue's stream (or a poll where the browser has
 * none). Ticks are buffered and flushed a few times a second so a busy market
 * never floods React with renders.
 */
function useVenueRows(exchange: Exchange, symbols: string[]): TickerMap {
  const [rows, setRows] = useState<TickerMap>({});
  const key = symbols.join(",");

  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    let pending: TickerMap = {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    const push = (symbol: string, row: TickerRow) => {
      pending[itemKey(exchange, symbol)] = row;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (cancelled) return;
        const batch = pending;
        pending = {};
        setRows((prev) => ({ ...prev, ...batch }));
      }, FLUSH_MS);
    };

    const load = () =>
      void TICKER_FETCHERS[exchange](symbols)
        .then((list) => {
          if (cancelled) return;
          const next: TickerMap = {};
          for (const t of list) {
            next[itemKey(exchange, t.symbol)] = {
              price: t.lastPrice,
              chg: t.priceChange,
              pct: t.priceChangePercent,
            };
          }
          setRows((prev) => ({ ...prev, ...next }));
        })
        .catch(console.error);

    // Stream ticks keep this fresh; if none arrive for a while (WebSocket
    // blocked on this network), fall back to polling the snapshot.
    let lastTick = Date.now();
    const pollIfSilent = () => {
      const id = setInterval(() => {
        if (!document.hidden && Date.now() - lastTick > 8_000) load();
      }, 5_000);
      return () => clearInterval(id);
    };

    load();
    let stop: () => void;
    if (exchange === "binance" || exchange === "binancef") {
      const ws = exchange === "binance" ? getBinanceWS() : getBinanceFuturesWS();
      const unsub = ws.subscribeMiniTickers(symbols, (t) => {
        lastTick = Date.now();
        push(t.symbol, { price: t.close, chg: t.close - t.open, pct: t.pct });
      });
      const stopPoll = pollIfSilent();
      stop = () => {
        unsub();
        stopPoll();
      };
    } else if (exchange === "bitget" || exchange === "bitgetspot") {
      const unsub = getBitgetWS().subscribeTickers(
        symbols,
        (t) => {
          lastTick = Date.now();
          push(t.symbol, { price: t.lastPrice, chg: t.priceChange, pct: t.priceChangePercent });
        },
        exchange === "bitget" ? "USDT-FUTURES" : "SPOT",
      );
      const stopPoll = pollIfSilent();
      stop = () => {
        unsub();
        stopPoll();
      };
    } else {
      // Stocks and Bitunix: no stream the browser can use — poll every 5s.
      const id = setInterval(() => {
        if (!document.hidden) load();
      }, 5_000);
      stop = () => clearInterval(id);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stop();
    };
    // `key` stands in for `symbols` (a new array every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange, key]);

  return rows;
}

/**
 * Live last price and 24h change for every symbol in the open list, keyed by
 * "exchange:symbol". Each venue is only asked for the symbols it really
 * lists (Binance rejects a whole batch over one unknown pair).
 */
export function useLiveTickers(items: SymbolItem[]): TickerMap {
  const [supported, setSupported] = useState<Partial<Record<Exchange, Set<string>>>>({});
  const venues = useMemo(() => [...new Set(items.map((i) => i.exchange))].sort(), [items]);
  const venuesKey = venues.join(",");

  useEffect(() => {
    let cancelled = false;
    for (const ex of venues) {
      fetchSupportedSymbols(ex)
        .then((set) => !cancelled && setSupported((prev) => (prev[ex] ? prev : { ...prev, [ex]: set })))
        .catch(console.error);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venuesKey]);

  const listed = (ex: Exchange) =>
    items
      .filter((i) => i.exchange === ex && supported[ex]?.has(i.symbol))
      .map((i) => i.symbol)
      .sort();

  // One hook per venue, always in the same order (rules of hooks).
  const a = useVenueRows("binance", listed("binance"));
  const b = useVenueRows("binancef", listed("binancef"));
  const c = useVenueRows("bitgetspot", listed("bitgetspot"));
  const d = useVenueRows("bitget", listed("bitget"));
  const e = useVenueRows("bitunix", listed("bitunix"));
  const f = useVenueRows("bitunixf", listed("bitunixf"));
  const g = useVenueRows("stocks", listed("stocks"));
  return useMemo(() => ({ ...a, ...b, ...c, ...d, ...e, ...f, ...g }), [a, b, c, d, e, f, g]);
}

/* ---- Number formatting, as CdeCripto's watchlist prints it (es-ES) ---- */

const fmt = (n: number, digits: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** More decimals the smaller the price: 77.123,4 · 3,456 · 0,1234 · 0,0000123 */
export function formatWlPrice(n: number | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  let digits = 2;
  if (abs < 0.001) digits = 7;
  else if (abs < 0.01) digits = 6;
  else if (abs < 1) digits = 4;
  else if (abs < 100) digits = 3;
  else if (abs >= 1000) digits = 1;
  return fmt(n, digits);
}

export function formatWlChange(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  let digits = 4;
  if (abs >= 1) digits = 3;
  if (abs >= 100) digits = 1;
  if (abs < 0.001 && abs > 0) digits = 7;
  const text = fmt(n, digits);
  return n > 0 ? `+${text}` : text;
}

export function formatWlPct(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${fmt(n, 2)}%`;
}

export function directionOf(row: TickerRow | undefined): "up" | "down" | "flat" {
  if (!row || !Number.isFinite(row.pct) || row.pct === 0) return "flat";
  return row.pct > 0 ? "up" : "down";
}
