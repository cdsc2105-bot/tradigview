"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchTickers24h } from "@/lib/binance/rest";
import { fetchBitgetTickers } from "@/lib/exchanges/bitget";
import { fetchFuturesTickers } from "@/lib/exchanges/binance-futures";
import { getBitgetWS } from "@/lib/exchanges/bitget-ws";
import { fetchStockTickers } from "@/lib/exchanges/stocks";
import { fetchSupportedSymbols } from "@/lib/exchanges/symbols";
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

const VENUES: Exchange[] = ["binance", "binancef", "bitget", "stocks"];

/**
 * Live last price and 24h change for every symbol in the open list, keyed by
 * "exchange:symbol". Crypto streams over each venue's WebSocket after a REST
 * snapshot; stocks and indices have no free socket, so they poll every 5s.
 */
export function useLiveTickers(items: SymbolItem[]): TickerMap {
  const [rows, setRows] = useState<TickerMap>({});
  const [supported, setSupported] = useState<Partial<Record<Exchange, Set<string>>>>({});

  // Which symbols each venue actually lists. Binance's batch ticker endpoint
  // 400s the whole request on a single unknown symbol, so this gate must
  // resolve before any ticker fetch runs.
  useEffect(() => {
    let cancelled = false;
    VENUES.forEach((ex) => {
      fetchSupportedSymbols(ex)
        .then((set) => {
          if (!cancelled) setSupported((prev) => ({ ...prev, [ex]: set }));
        })
        .catch(console.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const byVenue = useMemo(() => {
    const out: Record<Exchange, string[]> = { binance: [], binancef: [], bitget: [], stocks: [] };
    for (const it of items) {
      if (supported[it.exchange]?.has(it.symbol)) out[it.exchange].push(it.symbol);
    }
    for (const ex of VENUES) out[ex].sort();
    return out;
  }, [items, supported]);

  const keys = VENUES.map((ex) => byVenue[ex].join(","));

  const put = (ex: Exchange, symbol: string, row: TickerRow) =>
    setRows((prev) => ({ ...prev, [itemKey(ex, symbol)]: row }));

  const putMany = (ex: Exchange, list: { symbol: string; lastPrice: number; priceChange: number; priceChangePercent: number }[]) =>
    setRows((prev) => {
      const next = { ...prev };
      for (const t of list) {
        next[itemKey(ex, t.symbol)] = { price: t.lastPrice, chg: t.priceChange, pct: t.priceChangePercent };
      }
      return next;
    });

  // Binance spot: REST snapshot + mini-ticker stream
  useEffect(() => {
    const symbols = byVenue.binance;
    if (symbols.length === 0) return;
    let cancelled = false;
    fetchTickers24h(symbols)
      .then((t) => !cancelled && putMany("binance", t))
      .catch(console.error);
    const unsub = getBinanceWS().subscribeMiniTickers(symbols, (tick) =>
      put("binance", tick.symbol, { price: tick.close, chg: tick.close - tick.open, pct: tick.pct }),
    );
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys[0]]);

  // Binance perps: same, on the fstream host
  useEffect(() => {
    const symbols = byVenue.binancef;
    if (symbols.length === 0) return;
    let cancelled = false;
    fetchFuturesTickers(symbols)
      .then((t) => !cancelled && putMany("binancef", t))
      .catch(console.error);
    const unsub = getBinanceFuturesWS().subscribeMiniTickers(symbols, (tick) =>
      put("binancef", tick.symbol, { price: tick.close, chg: tick.close - tick.open, pct: tick.pct }),
    );
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys[1]]);

  // Bitget perps (crypto and tokenized stocks): snapshot, then ~0.35s ticks
  useEffect(() => {
    const symbols = byVenue.bitget;
    if (symbols.length === 0) return;
    let cancelled = false;
    fetchBitgetTickers(symbols)
      .then((t) => !cancelled && putMany("bitget", t))
      .catch(console.error);
    const unsub = getBitgetWS().subscribeTickers(symbols, (t) =>
      put("bitget", t.symbol, { price: t.lastPrice, chg: t.priceChange, pct: t.priceChangePercent }),
    );
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys[2]]);

  // Stocks & indices: poll. Yahoo is rate-limited, 5s is the sweet spot.
  useEffect(() => {
    const symbols = byVenue.stocks;
    if (symbols.length === 0) return;
    let cancelled = false;
    const load = () =>
      fetchStockTickers(symbols)
        .then((t) => !cancelled && putMany("stocks", t))
        .catch(console.error);
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys[3]]);

  return rows;
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
