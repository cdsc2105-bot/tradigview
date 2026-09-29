import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChartMode } from "@/lib/store/chart-store";
import {
  activeList,
  cleanName,
  listsOf,
  newId,
  normalize,
  seed,
  type ListsState,
  type WatchList,
} from "@/lib/watchlist/lists";

interface WatchlistStore extends ListsState {
  /** Desktop panel folded into a thin strip (remembered, like CdeCripto) */
  panelCollapsed: boolean;
  setPanelCollapsed: (v: boolean) => void;
  /**
   * Apply a change to the mode's open list. `fn` edits the copy it gets and
   * returns false when nothing changed (then nothing is saved).
   */
  edit: (mode: ChartMode, fn: (l: WatchList) => boolean | void) => boolean;
  setActive: (mode: ChartMode, id: string) => void;
  createList: (mode: ChartMode, name: string) => void;
  renameList: (id: string, name: string) => void;
  /** The last list of a mode can't go: the panel always has something to show */
  deleteList: (id: string) => void;
}

const cloneList = (l: WatchList): WatchList => ({
  ...l,
  items: l.items.map((it) => ({ ...it })),
});

export const useWatchlistStore = create<WatchlistStore>()(
  persist(
    (set, get) => ({
      ...seed(),
      panelCollapsed: false,
      setPanelCollapsed: (panelCollapsed) => set({ panelCollapsed }),
      edit: (mode, fn) => {
        const state = get();
        const current = activeList(state, mode);
        if (!current) return false;
        const copy = cloneList(current);
        if (fn(copy) === false) return false;
        set({ lists: state.lists.map((l) => (l.id === copy.id ? copy : l)) });
        return true;
      },
      setActive: (mode, id) =>
        set((s) =>
          s.lists.some((l) => l.id === id && l.mode === mode)
            ? { active: { ...s.active, [mode]: id } }
            : {},
        ),
      createList: (mode, name) =>
        set((s) => {
          const l: WatchList = {
            id: newId("l"),
            name: cleanName(name) || "Lista",
            mode,
            items: [],
          };
          return { lists: [...s.lists, l], active: { ...s.active, [mode]: l.id } };
        }),
      renameList: (id, name) =>
        set((s) => {
          const clean = cleanName(name);
          if (!clean) return {};
          return { lists: s.lists.map((l) => (l.id === id ? { ...l, name: clean } : l)) };
        }),
      deleteList: (id) =>
        set((s) => {
          const l = s.lists.find((x) => x.id === id);
          if (!l || listsOf(s, l.mode).length <= 1) return {};
          const lists = s.lists.filter((x) => x.id !== id);
          const active =
            s.active[l.mode] === id
              ? { ...s.active, [l.mode]: lists.find((x) => x.mode === l.mode)!.id }
              : s.active;
          return { lists, active };
        }),
    }),
    {
      name: "trading-watchlists",
      version: 1,
      partialize: (s) => ({
        lists: s.lists,
        active: s.active,
        panelCollapsed: s.panelCollapsed,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WatchlistStore>;
        const lists = normalize(p) ?? seed();
        return {
          ...current,
          ...lists,
          panelCollapsed: Boolean(p.panelCollapsed),
        };
      },
    },
  ),
);
