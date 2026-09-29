"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { fetchSupportedSymbols } from "@/lib/exchanges/symbols";
import { STOCK_SYMBOLS } from "@/lib/exchanges/stocks";
import {
  EXCHANGE_LABELS,
  TOKENIZED_STOCKS,
  isTokenizedStock,
  marketOf,
  type Market,
  type MarketKind,
} from "@/lib/exchanges/catalog";
import { POPULAR_SYMBOLS, useChartStore, type Exchange } from "@/lib/store/chart-store";
import { useWatchlistStore } from "@/lib/store/watchlist-store";
import {
  activeList,
  add,
  contains,
  itemKey,
  remove,
  sectionOf,
  sectionsOf,
} from "@/lib/watchlist/lists";
import { cn } from "@/lib/utils";
import { Modal } from "./menus";

/** Crypto venues in the order results list them (perps first, like CdeCripto). */
const CRYPTO_VENUES: Exchange[] = ["binancef", "bitget", "binance"];
const MAX_RESULTS = 80;
const POPULAR_RANK = new Map(POPULAR_SYMBOLS.map((s, i) => [s, i]));
const TOKENIZED_RANK = new Map(TOKENIZED_STOCKS.map((s, i) => [s.symbol, i]));

export interface SearchTarget {
  /** "list" adds/removes from the open list; "chart" opens the symbol */
  mode: "list" | "chart";
  /** Preselected destination section (undefined = best guess) */
  section?: string | null;
}

/**
 * Symbol search, CdeCripto-style: one box over every venue, Todo / Cripto /
 * Acciones filters, and — when adding — a "Añadir a" section picker. Rows
 * toggle in and out of the list, so several can be added in one go.
 */
export function WatchlistSearch({
  target,
  onClose,
}: {
  target: SearchTarget;
  onClose: () => void;
}) {
  const mode = useChartStore((s) => s.mode);
  const chartSymbol = useChartStore((s) => s.symbol);
  const chartExchange = useChartStore((s) => s.exchange);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const setExchange = useChartStore((s) => s.setExchange);
  const list = useWatchlistStore((s) => activeList(s, mode));
  const edit = useWatchlistStore((s) => s.edit);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MarketKind | "">("");
  const [catalog, setCatalog] = useState<Partial<Record<Exchange, Set<string>>>>({});
  const [activeIdx, setActiveIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (["binancef", "bitget", "binance", "stocks"] as Exchange[]).forEach((ex) =>
      fetchSupportedSymbols(ex)
        .then((set) => !cancelled && setCatalog((c) => ({ ...c, [ex]: set })))
        .catch(console.error),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = sectionsOf(list);
  const hasLooseTop = list.items[0]?.type === "s";
  // Where additions land: the given section, else the section of the symbol on
  // the chart, else the last section.
  const [dest, setDest] = useState<string | null>(() => {
    if (target.section !== undefined) return target.section;
    const key = itemKey(chartExchange, chartSymbol);
    if (contains(list, key)) return sectionOf(list, key);
    if (sections.length) return hasLooseTop ? null : sections[sections.length - 1].id;
    return null;
  });

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    const out: { market: Market; rank: number }[] = [];
    const match = (m: Market) => {
      if (!q) return 0;
      const t = m.ticker.toUpperCase();
      if (t === q || m.symbol === q) return 0;
      if (t.startsWith(q)) return 1;
      if (m.symbol.includes(q) || m.name.toUpperCase().includes(q)) return 2;
      return -1;
    };

    if (kind !== "stock") {
      CRYPTO_VENUES.forEach((ex, venueIdx) => {
        const set = catalog[ex];
        if (!set) return;
        for (const s of set) {
          if (!s.endsWith("USDT") || isTokenizedStock(ex, s)) continue;
          const popular = POPULAR_RANK.get(s);
          // Empty box: only the well-known coins, not the wall of listings
          if (!q && popular === undefined) continue;
          const m = marketOf(ex, s);
          const hit = match(m);
          if (hit < 0) continue;
          out.push({ market: m, rank: hit * 1e6 + (popular ?? 5000) * 10 + venueIdx });
        }
      });
    }
    if (kind !== "crypto") {
      const bitget = catalog.bitget;
      for (const t of TOKENIZED_STOCKS) {
        if (bitget && !bitget.has(t.symbol)) continue; // delisted
        const m = marketOf("bitget", t.symbol);
        const hit = match(m);
        if (hit < 0) continue;
        // Stocks sort right after the popular coins when browsing "Todo"
        out.push({ market: m, rank: hit * 1e6 + 1000 + (TOKENIZED_RANK.get(t.symbol) ?? 0) * 10 });
      }
      STOCK_SYMBOLS.forEach((s, i) => {
        const m = marketOf("stocks", s);
        const hit = match(m);
        if (hit < 0) return;
        out.push({ market: m, rank: hit * 1e6 + 3000 + i * 10 });
      });
    }
    return out
      .sort((a, b) => a.rank - b.rank || a.market.ticker.localeCompare(b.market.ticker))
      .slice(0, MAX_RESULTS)
      .map((r) => r.market);
  }, [catalog, kind, query]);

  const loading = Object.keys(catalog).length === 0;

  const toggle = (m: Market) => {
    const key = itemKey(m.exchange, m.symbol);
    edit(mode, (l) => (contains(l, key) ? remove(l, key) : add(l, m.exchange, m.symbol, dest)));
  };
  const openOnChart = (m: Market) => {
    setExchange(m.exchange);
    setSymbol(m.symbol);
    onClose();
  };
  const choose = (m: Market) => (target.mode === "chart" ? openOnChart(m) : toggle(m));

  const moveActive = (i: number) => {
    const next = Math.max(-1, Math.min(i, results.length - 1));
    setActiveIdx(next);
    listRef.current
      ?.querySelectorAll<HTMLElement>("[role=option]")
      [next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <Modal
      onClose={onClose}
      label={target.mode === "chart" ? "Buscar símbolo" : "Añadir símbolo"}
      className="flex max-h-[min(660px,calc(100vh-48px))] max-w-[540px] flex-col p-[18px] pb-3"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {target.mode === "chart" ? "Buscar símbolo" : "Añadir símbolo"}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="grid h-7 w-7 place-items-center rounded-md text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <input
        autoFocus
        type="search"
        value={query}
        placeholder="Buscar: BTC, NVDA, Tesla…"
        aria-label="Buscar símbolo"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIdx(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            moveActive(activeIdx + 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveActive(activeIdx - 1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const i = activeIdx >= 0 ? activeIdx : 0;
            if (results[i]) {
              setActiveIdx(i);
              choose(results[i]);
            }
          }
        }}
        className="mb-2.5 h-10 w-full rounded-lg border border-tv-border bg-tv-bg px-3 text-sm text-tv-text outline-none focus:border-tv-blue"
      />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2.5">
        <div role="group" aria-label="Tipo de mercado" className="flex gap-1">
          {(
            [
              ["", "Todo"],
              ["crypto", "Cripto"],
              ["stock", "Acciones"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
                setActiveIdx(-1);
              }}
              className={cn(
                "h-7 rounded-full border px-3 text-xs transition-colors",
                kind === value
                  ? "border-tv-text bg-tv-text text-tv-bg"
                  : "border-tv-border text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {target.mode === "list" && sections.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-tv-text-muted">
            <span>Añadir a</span>
            <select
              value={dest ?? ""}
              onChange={(e) => setDest(e.target.value || null)}
              className="h-7 max-w-[160px] rounded-md border border-tv-border bg-tv-bg px-2 text-xs text-tv-text outline-none"
            >
              {hasLooseTop && <option value="">Sin sección</option>}
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div
        ref={listRef}
        role="listbox"
        aria-label="Resultados"
        className="-mx-1.5 flex min-h-[140px] flex-1 flex-col gap-0.5 overflow-y-auto px-1.5"
      >
        {results.length === 0 && (
          <div className="p-6 text-center text-xs text-tv-text-muted">
            {loading ? "Cargando…" : "Sin resultados"}
          </div>
        )}
        {results.map((m, i) => {
          const key = itemKey(m.exchange, m.symbol);
          const inList = contains(list, key);
          const onChart = m.symbol === chartSymbol && m.exchange === chartExchange;
          const stock = m.kind === "stock";
          return (
            <div
              key={key}
              role="option"
              aria-selected={target.mode === "list" ? inList : onChart}
              onClick={() => {
                setActiveIdx(i);
                choose(m);
              }}
              className={cn(
                "grid cursor-pointer items-center gap-2.5 rounded-md px-2 py-2",
                target.mode === "list"
                  ? "grid-cols-[76px_minmax(0,1fr)_auto_24px]"
                  : "grid-cols-[76px_minmax(0,1fr)_auto]",
                "hover:bg-tv-panel-hover",
                i === activeIdx && "bg-tv-panel-hover",
                target.mode === "chart" && onChart && "bg-tv-panel-hover",
              )}
            >
              <span className="truncate text-[13px] font-semibold">{m.ticker}</span>
              <span className="truncate text-xs text-tv-text-muted">{m.name}</span>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] tracking-wide",
                  stock ? "text-sky-400" : "text-amber-400",
                )}
              >
                {stock ? "Acción" : "Cripto"} · {EXCHANGE_LABELS[m.exchange].toUpperCase()}
              </span>
              {target.mode === "list" && (
                <span
                  title={inList ? "Quitar de la lista" : "Añadir a la lista"}
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-md border",
                    inList
                      ? "border-tv-blue bg-tv-blue/15 text-tv-blue"
                      : "border-tv-border text-tv-text-muted",
                  )}
                >
                  {inList ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 text-center text-[11px] text-tv-text-dim">
        {target.mode === "chart"
          ? "Enter abre el gráfico · Esc cierra"
          : "Enter añade o quita · Esc cierra"}
      </div>
    </Modal>
  );
}
