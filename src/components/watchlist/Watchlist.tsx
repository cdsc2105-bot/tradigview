"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, EllipsisVertical, Plus, Search, Trash2 } from "lucide-react";
import { CoinIcon } from "@/components/brand/CoinIcon";
import { marketOf, type Market } from "@/lib/exchanges/catalog";
import { useChartStore } from "@/lib/store/chart-store";
import { useWatchlistStore } from "@/lib/store/watchlist-store";
import {
  activeList,
  addSection,
  groups,
  itemKey,
  listsOf,
  move,
  moveSection,
  remove,
  removeSection,
  renameSection,
  sectionsOf,
  symbolsOf,
  toggleSection,
  type MoveTarget,
  type SectionItem,
  type SymbolItem,
} from "@/lib/watchlist/lists";
import { cn } from "@/lib/utils";
import { useDialogs, useMenu, type MenuOption } from "./menus";
import { WatchlistSearch, type SearchTarget } from "./WatchlistSearch";
import {
  directionOf,
  formatWlChange,
  formatWlPct,
  formatWlPrice,
  useLiveTickers,
  type TickerRow,
} from "./useLiveTickers";

/** Touch screens get long-press menus instead of drag-and-drop. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(pointer: coarse)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

/** Row label: the pair as the venue names it, stocks by their short name. */
function labelOf(m: Market): string {
  return m.exchange === "stocks" ? m.ticker : m.symbol;
}

/** Small venue tag so the same coin on two venues can be told apart. */
const VENUE_TAG: Partial<Record<Market["exchange"], string>> = {
  binance: "SPOT",
  bitgetspot: "BG SPOT",
  bitget: "BG",
  bitunix: "BX SPOT",
  bitunixf: "BX",
};

/**
 * Watchlist panel, a copy of CdeCripto's: named lists per mode, user sections
 * that fold, rename and reorder, drag-and-drop (long-press menu on phones),
 * live prices with a digit flash, and a footer with the symbol on the chart.
 */
export function Watchlist({ onHide }: { onHide?: () => void }) {
  const mode = useChartStore((s) => s.layout);
  const chartSymbol = useChartStore((s) => s.symbol);
  const chartExchange = useChartStore((s) => s.exchange);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const setExchange = useChartStore((s) => s.setExchange);
  const setWatchlistOpen = useChartStore((s) => s.setWatchlistOpen);

  const list = useWatchlistStore((s) => activeList(s, mode));
  const allLists = useWatchlistStore((s) => s.lists);
  const edit = useWatchlistStore((s) => s.edit);
  const setActive = useWatchlistStore((s) => s.setActive);
  const createList = useWatchlistStore((s) => s.createList);
  const renameList = useWatchlistStore((s) => s.renameList);
  const deleteList = useWatchlistStore((s) => s.deleteList);

  const modeLists = useMemo(() => listsOf({ lists: allLists }, mode), [allLists, mode]);
  const symbols = useMemo(() => symbolsOf(list), [list]);
  const rows = useLiveTickers(symbols);

  const menu = useMenu();
  const dialogs = useDialogs();
  const [search, setSearch] = useState<SearchTarget | null>(null);
  const coarse = useCoarsePointer();

  const chartKey = itemKey(chartExchange, chartSymbol);
  const lastOnly = modeLists.length <= 1;

  /* ---- actions -------------------------------------------------------- */

  const select = (it: SymbolItem) => {
    setExchange(it.exchange);
    setSymbol(it.symbol);
    setWatchlistOpen(false); // close the mobile drawer after picking
  };

  const newList = async () => {
    const name = await dialogs.prompt("Nueva lista", "", "Crear");
    if (name) createList(mode, name);
  };
  const renameCurrent = async () => {
    const name = await dialogs.prompt("Renombrar lista", list.name);
    if (name) renameList(list.id, name);
  };
  const deleteCurrent = async () => {
    const ok = await dialogs.confirm(
      "Eliminar lista",
      `Se borrará «${list.name}» con sus secciones. Las demás listas no cambian.`,
      "Eliminar",
    );
    if (ok) deleteList(list.id);
  };
  const newSection = async () => {
    const name = await dialogs.prompt("Nueva sección", "", "Crear");
    if (name) edit(mode, (l) => void addSection(l, name));
  };
  const renameSec = async (sec: SectionItem) => {
    const name = await dialogs.prompt("Renombrar sección", sec.name);
    if (name) edit(mode, (l) => renameSection(l, sec.id, name));
  };

  const listsMenu = (anchor: HTMLElement) =>
    menu.open(anchor, [
      ...modeLists.map((l) => ({
        label: l.name,
        detail: String(symbolsOf(l).length),
        checked: l.id === list.id,
        action: () => setActive(mode, l.id),
      })),
      "sep",
      { label: "Crear lista nueva…", action: newList },
      { label: "Renombrar lista…", action: renameCurrent },
      { label: "Añadir sección…", action: newSection },
      "sep",
      { label: "Eliminar lista…", danger: true, disabled: lastOnly, action: deleteCurrent },
    ]);

  const panelMenu = (anchor: HTMLElement) =>
    menu.open(
      anchor,
      [
        { label: "Añadir sección…", action: newSection },
        { label: "Renombrar lista…", action: renameCurrent },
        { label: "Eliminar lista…", danger: true, disabled: lastOnly, action: deleteCurrent },
        ...(onHide ? (["sep", { label: "Ocultar listas", action: onHide }] as MenuOption[]) : []),
      ],
      "right",
    );

  const sectionMenu = (anchor: HTMLElement, sec: SectionItem) =>
    menu.open(
      anchor,
      [
        { label: "Renombrar…", action: () => renameSec(sec) },
        { label: "Añadir símbolo aquí…", action: () => setSearch({ mode: "list", section: sec.id }) },
        "sep",
        { label: "Subir", action: () => edit(mode, (l) => moveSection(l, sec.id, -1)) },
        { label: "Bajar", action: () => edit(mode, (l) => moveSection(l, sec.id, 1)) },
        "sep",
        {
          label: "Quitar sección",
          detail: "los símbolos se quedan",
          danger: true,
          action: () => edit(mode, (l) => removeSection(l, sec.id)),
        },
      ],
      "right",
    );

  /** Phones: long-press a row for remove / move-to-section. */
  const rowMenu = (anchor: HTMLElement, it: SymbolItem) => {
    const key = itemKey(it.exchange, it.symbol);
    const secs = sectionsOf(list);
    menu.open(
      anchor,
      [
        { label: "Quitar de la lista", danger: true, action: () => edit(mode, (l) => remove(l, key)) },
        ...(secs.length
          ? ([
              "sep",
              {
                label: "Mover a sección…",
                // Defer so this menu's close doesn't swallow the next one
                action: () =>
                  setTimeout(() =>
                    menu.open(
                      anchor,
                      secs.map((sec) => ({
                        label: sec.name,
                        action: () => edit(mode, (l) => move(l, key, { section: sec.id })),
                      })),
                      "right",
                    ),
                  ),
              },
            ] as MenuOption[])
          : []),
      ],
      "right",
    );
  };

  /* ---- drag and drop (desktop) --------------------------------------- */

  const dragging = useRef<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; where: "before" | "after" | "into" } | null>(null);

  const dropTarget = (e: React.DragEvent, it: SymbolItem): MoveTarget | null => {
    const key = itemKey(it.exchange, it.symbol);
    if (key === dragging.current) return null;
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? { before: key } : { after: key };
  };

  /* ---- render ---------------------------------------------------------- */

  const chartMarket = marketOf(chartExchange, chartSymbol);

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      {/* Head: list switcher + add + more */}
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-tv-border pl-2.5 pr-2">
        <button
          type="button"
          onClick={(e) => listsMenu(e.currentTarget)}
          title="Cambiar de lista"
          aria-haspopup="menu"
          aria-expanded="false"
          className="group -ml-1 inline-flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border border-transparent pl-2 pr-1.5 text-[13px] font-semibold text-tv-text hover:border-tv-border hover:bg-tv-panel-hover aria-expanded:border-tv-border aria-expanded:bg-tv-panel-hover"
        >
          <span className="truncate">{list.name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-tv-text-muted transition-transform group-aria-expanded:rotate-180" />
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label="Añadir símbolo" onClick={() => setSearch({ mode: "list" })}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton label="Más opciones" onClick={(e) => panelMenu(e.currentTarget)}>
            <EllipsisVertical className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* Column heads — "Cbo" drops out when the panel is narrow */}
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_4.6rem_3.4rem_3.6rem] items-end gap-1 px-2.5 pb-1 pt-0.5 text-[11px] tracking-wide text-tv-text-muted @max-[330px]:grid-cols-[minmax(0,1fr)_4.6rem_3.6rem]">
        <span>Símbolo</span>
        <span className="text-right">Última</span>
        <span className="text-right @max-[330px]:hidden">Cbo</span>
        <span className="text-right">Cambio%</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 [scrollbar-width:thin]">
        {groups(list).map((g, gi) => {
          const sec = g.section;
          return (
            <div key={sec?.id ?? "top"}>
              {sec && (
                <div
                  onDragOver={(e) => {
                    if (!dragging.current) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDrop({ id: sec.id, where: "into" });
                  }}
                  onDragLeave={() => setDrop(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const key = dragging.current;
                    setDrop(null);
                    dragging.current = null;
                    if (key) edit(mode, (l) => move(l, key, { section: sec.id }));
                  }}
                  className={cn(
                    "group/sec relative flex items-center gap-0.5",
                    gi > 0 && "mt-2 border-t border-tv-border pt-1.5",
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={!sec.collapsed}
                    title={sec.collapsed ? "Desplegar" : "Plegar"}
                    onClick={() => edit(mode, (l) => toggleSection(l, sec.id))}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      renameSec(sec);
                    }}
                    className={cn(
                      "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                      drop?.id === sec.id && "bg-[#845cff]/15 text-tv-text",
                    )}
                  >
                    <ChevronDown
                      className={cn("h-3 w-3 shrink-0 transition-transform", sec.collapsed && "-rotate-90")}
                    />
                    <span className="truncate">{sec.name}</span>
                    <span className="ml-auto rounded-full bg-tv-panel-hover px-1.5 py-px text-[10px] font-medium tracking-normal text-tv-text-dim">
                      {g.symbols.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    title={`Opciones de ${sec.name}`}
                    aria-label={`Opciones de ${sec.name}`}
                    aria-haspopup="menu"
                    aria-expanded="false"
                    onClick={(e) => sectionMenu(e.currentTarget, sec)}
                    className="grid h-6 w-6 place-items-center rounded text-tv-text-dim opacity-0 transition-opacity hover:bg-tv-panel-hover hover:text-tv-text focus-visible:opacity-100 group-hover/sec:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </button>
                </div>
              )}
              {!sec?.collapsed &&
                g.symbols.map((it) => {
                  const key = itemKey(it.exchange, it.symbol);
                  return (
                    <WatchRow
                      key={key}
                      item={it}
                      row={rows[key]}
                      active={key === chartKey}
                      draggable={!coarse}
                      dropMark={drop?.id === key ? drop.where : null}
                      onSelect={() => select(it)}
                      onRemove={() => edit(mode, (l) => remove(l, key))}
                      onLongPress={coarse ? (el) => rowMenu(el, it) : undefined}
                      onDragStart={(e) => {
                        dragging.current = key;
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", key);
                      }}
                      onDragEnd={() => {
                        dragging.current = null;
                        setDrop(null);
                      }}
                      onDragOver={(e) => {
                        if (!dragging.current) return;
                        const t = dropTarget(e, it);
                        if (!t) return setDrop(null);
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDrop({ id: key, where: "before" in t ? "before" : "after" });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragging.current;
                        const t = dropTarget(e, it);
                        setDrop(null);
                        dragging.current = null;
                        if (from && t) edit(mode, (l) => move(l, from, t));
                      }}
                    />
                  );
                })}
            </div>
          );
        })}

        {symbols.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 px-3 py-7 text-center text-xs text-tv-text-muted">
            <p>Esta lista está vacía.</p>
            <button
              type="button"
              onClick={() => setSearch({ mode: "list" })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-tv-border bg-tv-bg px-3 text-xs text-tv-text hover:bg-tv-panel-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir símbolo
            </button>
          </div>
        )}
      </div>

      {/* Foot: the symbol on the chart + quick actions */}
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-t border-tv-border bg-tv-bg/60 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Avatar market={chartMarket} />
          <span className="truncate text-xs font-semibold tracking-tight">{labelOf(chartMarket)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label="Buscar símbolo" onClick={() => setSearch({ mode: "chart" })}>
            <Search className="h-[15px] w-[15px]" />
          </IconButton>
          <IconButton label="Añadir a la lista" onClick={() => setSearch({ mode: "list" })}>
            <Plus className="h-[15px] w-[15px]" />
          </IconButton>
          <IconButton label="Más opciones" onClick={(e) => panelMenu(e.currentTarget)}>
            <EllipsisVertical className="h-[15px] w-[15px]" />
          </IconButton>
        </div>
      </div>

      <a
        href="https://www.tradingview.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 px-3 pb-1.5 text-[10px] text-tv-text-dim hover:text-tv-text-muted"
      >
        Gráficos con Lightweight Charts™ de TradingView
      </a>

      {menu.element}
      {dialogs.element}
      {search && <WatchlistSearch target={search} onClose={() => setSearch(null)} />}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md border border-transparent text-tv-text-muted transition-colors hover:border-tv-border hover:bg-tv-panel-hover hover:text-tv-text"
    >
      {children}
    </button>
  );
}

/** Official logo (coins and shares), with the app's own fallback. */
function Avatar({ market }: { market: Market }) {
  return <CoinIcon symbol={market.symbol} />;
}

const DIR_TEXT = { up: "text-tv-green", down: "text-tv-red", flat: "text-tv-text-muted" } as const;

function WatchRow({
  item,
  row,
  active,
  draggable,
  dropMark,
  onSelect,
  onRemove,
  onLongPress,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  item: SymbolItem;
  row: TickerRow | undefined;
  active: boolean;
  draggable: boolean;
  dropMark: "before" | "after" | "into" | null;
  onSelect: () => void;
  onRemove: () => void;
  onLongPress?: (el: HTMLElement) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const market = marketOf(item.exchange, item.symbol);
  const dir = directionOf(row);
  const [dragged, setDragged] = useState(false);

  // Long press (500 ms, cancelled by moving the finger) opens the row menu and
  // swallows the click that follows.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  return (
    <div
      draggable={draggable}
      onClick={() => {
        if (swallowClick.current) {
          swallowClick.current = false;
          return;
        }
        onSelect();
      }}
      onDragStart={(e) => {
        setDragged(true);
        onDragStart(e);
      }}
      onDragEnd={() => {
        setDragged(false);
        onDragEnd();
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerDown={(e) => {
        if (!onLongPress || (e.target as HTMLElement).closest("button")) return;
        const el = e.currentTarget;
        press.current = {
          x: e.clientX,
          y: e.clientY,
          timer: window.setTimeout(() => {
            press.current = null;
            swallowClick.current = true;
            onLongPress(el);
          }, 500),
        };
      }}
      onPointerMove={(e) => {
        if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) {
          cancelPress();
        }
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => {
        if (onLongPress) e.preventDefault(); // Android's own long-press menu
      }}
      className={cn(
        "group/row relative grid min-h-8 cursor-pointer select-none grid-cols-[minmax(0,1fr)_4.6rem_3.4rem_3.6rem] items-center gap-1 rounded border border-transparent px-1.5 transition-colors @max-[330px]:grid-cols-[minmax(0,1fr)_4.6rem_3.6rem]",
        "hover:bg-tv-panel-hover",
        active && "border-tv-border bg-tv-panel-hover shadow-[inset_0_0_0_1px_var(--color-tv-border)]",
        dragged && "opacity-40",
        dropMark === "before" && "shadow-[inset_0_2px_0_var(--color-tv-blue)]",
        dropMark === "after" && "shadow-[inset_0_-2px_0_var(--color-tv-blue)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Avatar market={market} />
        <span className="truncate text-xs font-medium tracking-tight">{labelOf(market)}</span>
        {VENUE_TAG[item.exchange] && (
          <span className="shrink-0 text-[8px] font-semibold tracking-wide text-tv-text-dim">
            {VENUE_TAG[item.exchange]}
          </span>
        )}
      </div>
      <FlashPrice text={formatWlPrice(row?.price)} dir={dir} />
      <span className={cn("text-right font-mono text-[11px] font-medium tabular-nums @max-[330px]:hidden", DIR_TEXT[dir])}>
        {formatWlChange(row?.chg)}
      </span>
      <span className={cn("text-right font-mono text-[11px] font-medium tabular-nums", DIR_TEXT[dir])}>
        {formatWlPct(row?.pct)}
      </span>
      <button
        type="button"
        title={`Quitar ${market.ticker} de la lista`}
        aria-label={`Quitar ${market.ticker} de la lista`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-0.5 top-1/2 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded bg-tv-panel text-tv-text-muted shadow hover:text-tv-red group-hover/row:grid [@media(hover:none)]:!hidden"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Price that flashes only the digits that changed, green on the way up and
 * red on the way down, for 420 ms — the way CdeCripto's watchlist ticks.
 */
function FlashPrice({ text, dir }: { text: string; dir: "up" | "down" | "flat" }) {
  const [prev, setPrev] = useState(text);
  const [flash, setFlash] = useState<{ base: string; tail: string; dir: typeof dir } | null>(null);

  // Compare during render (not in an effect) so the flash lands in the same paint.
  if (text !== prev) {
    setPrev(text);
    if (prev !== "—" && text !== "—") {
      let i = 0;
      while (i < prev.length && i < text.length && prev[i] === text[i]) i++;
      setFlash({ base: text.slice(0, i), tail: text.slice(i), dir });
    }
  }

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 420);
    return () => window.clearTimeout(id);
  }, [flash]);

  const live = flash && flash.base + flash.tail === text ? flash : null;
  return (
    <span className="text-right font-mono text-[11px] font-medium tabular-nums text-tv-text">
      {live ? (
        <>
          {live.base}
          <span className={live.dir === "up" ? "text-tv-green" : live.dir === "down" ? "text-tv-red" : undefined}>
            {live.tail}
          </span>
        </>
      ) : (
        text
      )}
    </span>
  );
}
