import type { ChartMode, Exchange } from "@/lib/store/chart-store";

/**
 * Watchlists as in TradingView (and CdeCripto's monitor). Pure data, no React.
 *
 * A list is a sequence of symbols and section headers. Symbols after a header
 * belong to that section; any before the first header sit loose at the top.
 * Removing a header keeps its symbols: they join the section above, like TV.
 *
 * Each mode (VWAP, NORMAL) has its own lists and remembers which one is open.
 * Crypto and stocks mix freely in the same list.
 *
 * Every mutator works on the list it is given and returns whether anything
 * changed; the store hands them a fresh copy so React sees new references.
 */

export interface SymbolItem {
  type: "s";
  symbol: string;
  exchange: Exchange;
}

export interface SectionItem {
  type: "sec";
  id: string;
  name: string;
  collapsed: boolean;
}

export type ListItem = SymbolItem | SectionItem;

export interface WatchList {
  id: string;
  name: string;
  mode: ChartMode;
  items: ListItem[];
}

export interface ListsState {
  lists: WatchList[];
  /** Open list per mode */
  active: Record<ChartMode, string>;
}

export interface Group {
  section: SectionItem | null;
  symbols: SymbolItem[];
}

export const MAX_NAME = 40;

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function cleanName(name: string): string {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

export const itemKey = (exchange: Exchange, symbol: string) => `${exchange}:${symbol}`;

const isSymbol = (it: ListItem): it is SymbolItem => it.type === "s";
const isSection = (it: ListItem): it is SectionItem => it.type === "sec";

export function section(name: string, collapsed = false): SectionItem {
  return { type: "sec", id: newId("s"), name: cleanName(name) || "Sección", collapsed };
}

/* ---- Reading a list ------------------------------------------------ */

export function indexOf(l: WatchList, key: string): number {
  return l.items.findIndex((it) => isSymbol(it) && itemKey(it.exchange, it.symbol) === key);
}

export function contains(l: WatchList, key: string): boolean {
  return indexOf(l, key) >= 0;
}

export function symbolsOf(l: WatchList): SymbolItem[] {
  return l.items.filter(isSymbol);
}

export function sectionsOf(l: WatchList): SectionItem[] {
  return l.items.filter(isSection);
}

/** Groups to paint; the first has a null section if symbols precede any header. */
export function groups(l: WatchList): Group[] {
  const out: Group[] = [];
  let current: Group | null = null;
  for (const it of l.items) {
    if (isSection(it)) {
      current = { section: it, symbols: [] };
      out.push(current);
      continue;
    }
    if (!current) {
      current = { section: null, symbols: [] };
      out.push(current);
    }
    current.symbols.push(it);
  }
  return out;
}

function sectionIndex(l: WatchList, id: string): number {
  return l.items.findIndex((it) => isSection(it) && it.id === id);
}

/** Where a section ends: index of the next header, or the end of the list. */
function sectionEnd(l: WatchList, id: string | null): number {
  const start = id == null ? -1 : sectionIndex(l, id);
  if (id != null && start < 0) return l.items.length;
  for (let i = start + 1; i < l.items.length; i++) {
    if (isSection(l.items[i])) return i;
  }
  return l.items.length;
}

/** Section a symbol sits in (null = loose at the top). */
export function sectionOf(l: WatchList, key: string): string | null {
  const i = indexOf(l, key);
  for (let j = i - 1; j >= 0; j--) {
    const it = l.items[j];
    if (isSection(it)) return it.id;
  }
  return null;
}

/* ---- Changing a list ----------------------------------------------- */

/** Appends at the end of the section (or of the list). Never duplicates. */
export function add(
  l: WatchList,
  exchange: Exchange,
  symbol: string,
  sectionId?: string | null,
): boolean {
  if (contains(l, itemKey(exchange, symbol))) return false;
  const at = sectionId === undefined ? l.items.length : sectionEnd(l, sectionId);
  l.items.splice(at, 0, { type: "s", symbol, exchange });
  return true;
}

export function remove(l: WatchList, key: string): boolean {
  const i = indexOf(l, key);
  if (i < 0) return false;
  l.items.splice(i, 1);
  return true;
}

export function addSection(l: WatchList, name: string): string {
  const s = section(name);
  l.items.push(s);
  return s.id;
}

export function renameSection(l: WatchList, id: string, name: string): boolean {
  const i = sectionIndex(l, id);
  const clean = cleanName(name);
  if (i < 0 || !clean) return false;
  (l.items[i] as SectionItem).name = clean;
  return true;
}

export function removeSection(l: WatchList, id: string): boolean {
  const i = sectionIndex(l, id);
  if (i < 0) return false;
  l.items.splice(i, 1);
  return true;
}

export function toggleSection(l: WatchList, id: string): boolean {
  const i = sectionIndex(l, id);
  if (i < 0) return false;
  const sec = l.items[i] as SectionItem;
  sec.collapsed = !sec.collapsed;
  return true;
}

/** Moves a whole section (header and its symbols) up or down one place. */
export function moveSection(l: WatchList, id: string, step: -1 | 1): boolean {
  const start = sectionIndex(l, id);
  if (start < 0) return false;
  const end = sectionEnd(l, id);
  const block = l.items.slice(start, end);
  const headers = l.items.map((it, i) => (isSection(it) ? i : -1)).filter((i) => i >= 0);
  const pos = headers.indexOf(start);
  if (step < 0) {
    if (pos <= 0) return false;
    const before = headers[pos - 1];
    l.items.splice(start, block.length);
    l.items.splice(before, 0, ...block);
    return true;
  }
  if (pos >= headers.length - 1) return false;
  const nextEnd = sectionEnd(l, (l.items[headers[pos + 1]] as SectionItem).id);
  const next = l.items.slice(end, nextEnd);
  l.items.splice(start, block.length + next.length, ...next, ...block);
  return true;
}

export type MoveTarget =
  | { before: string }
  | { after: string }
  /** Top of that section; null = very top of the list */
  | { section: string | null };

/** Moves a symbol before/after another, or to the top of a section. */
export function move(l: WatchList, key: string, target: MoveTarget): boolean {
  const from = indexOf(l, key);
  if (from < 0) return false;
  const [item] = l.items.splice(from, 1);
  let to = -1;
  if ("before" in target) to = indexOf(l, target.before);
  else if ("after" in target) {
    to = indexOf(l, target.after);
    if (to >= 0) to += 1;
  } else {
    to = target.section == null ? 0 : sectionIndex(l, target.section) + 1;
    if (target.section != null && to === 0) to = -1;
  }
  if (to < 0) {
    l.items.splice(from, 0, item);
    return false;
  }
  l.items.splice(to, 0, item);
  return to !== from;
}

/* ---- Whole state --------------------------------------------------- */

export function listsOf(state: Pick<ListsState, "lists">, mode: ChartMode): WatchList[] {
  return state.lists.filter((l) => l.mode === mode);
}

export function activeList(state: ListsState, mode: ChartMode): WatchList {
  const mine = listsOf(state, mode);
  return mine.find((l) => l.id === state.active[mode]) ?? mine[0];
}

/* ---- Seeding ------------------------------------------------------- */

/**
 * First-run list, as CdeCripto ships it: BTC, ETH and HYPE perps under
 * "Cripto", plus the headline tokenized indices and stocks under "Acciones".
 */
export function defaultList(name: string, mode: ChartMode): WatchList {
  const items: ListItem[] = [
    section("Cripto"),
    { type: "s", symbol: "BTCUSDT", exchange: "binancef" },
    { type: "s", symbol: "ETHUSDT", exchange: "binancef" },
    { type: "s", symbol: "HYPEUSDT", exchange: "binancef" },
    section("Acciones"),
    { type: "s", symbol: "SP500USDT", exchange: "bitget" },
    { type: "s", symbol: "NDX100USDT", exchange: "bitget" },
    { type: "s", symbol: "NVDAUSDT", exchange: "bitget" },
    { type: "s", symbol: "AAPLUSDT", exchange: "bitget" },
    { type: "s", symbol: "MSFTUSDT", exchange: "bitget" },
  ];
  return { id: newId("l"), name, mode, items };
}

export function seed(): ListsState {
  const vwap = defaultList("VWAP", "vwap");
  const normal = defaultList("Principal", "normal");
  return { lists: [vwap, normal], active: { vwap: vwap.id, normal: normal.id } };
}

const EXCHANGES: Exchange[] = ["binance", "binancef", "bitget", "stocks"];

/** Validates what comes back from storage; null when it can't be recovered. */
export function normalize(raw: unknown): ListsState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ListsState>;
  if (!Array.isArray(r.lists)) return null;
  const lists: WatchList[] = [];
  const ids = new Set<string>();
  for (const rl of r.lists) {
    if (!rl || typeof rl !== "object" || !Array.isArray(rl.items)) continue;
    const id = typeof rl.id === "string" && rl.id && !ids.has(rl.id) ? rl.id : newId("l");
    ids.add(id);
    const l: WatchList = {
      id,
      name: cleanName(rl.name) || "Lista",
      mode: rl.mode === "vwap" ? "vwap" : "normal",
      items: [],
    };
    for (const it of rl.items as ListItem[]) {
      if (it && it.type === "sec") {
        l.items.push({
          type: "sec",
          id: typeof it.id === "string" && it.id && sectionIndex(l, it.id) < 0 ? it.id : newId("s"),
          name: cleanName(it.name) || "Sección",
          collapsed: Boolean(it.collapsed),
        });
      } else if (
        it &&
        it.type === "s" &&
        typeof it.symbol === "string" &&
        EXCHANGES.includes(it.exchange) &&
        !contains(l, itemKey(it.exchange, it.symbol))
      ) {
        l.items.push({ type: "s", symbol: it.symbol, exchange: it.exchange });
      }
    }
    lists.push(l);
  }
  const modes: ChartMode[] = ["vwap", "normal"];
  for (const m of modes) {
    if (!lists.some((l) => l.mode === m)) lists.push(defaultList(m === "vwap" ? "VWAP" : "Principal", m));
  }
  const active = {} as Record<ChartMode, string>;
  for (const m of modes) {
    const mine = lists.filter((l) => l.mode === m);
    const wanted = r.active?.[m];
    active[m] = mine.some((l) => l.id === wanted) ? (wanted as string) : mine[0].id;
  }
  return { lists, active };
}
