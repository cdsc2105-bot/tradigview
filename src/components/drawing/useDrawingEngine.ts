"use client";

import { useSyncExternalStore } from "react";
import { drawingEngineStore, type DrawingEngine, type EngineSnapshot } from "./engine";

const noop = () => () => {};
const EMPTY: EngineSnapshot = {
  tool: null,
  magnet: "off",
  keepDrawing: false,
  selected: null,
  canUndo: false,
  canRedo: false,
  count: 0,
};

/** The chart's drawing engine (null until the chart mounts) and its live state. */
export function useDrawingEngine(): { engine: DrawingEngine | null; state: EngineSnapshot } {
  const engine = useSyncExternalStore(drawingEngineStore.subscribe, drawingEngineStore.get, () => null);
  const state = useSyncExternalStore(
    engine ? engine.subscribe : noop,
    engine ? engine.getSnapshot : () => EMPTY,
    () => EMPTY,
  );
  return { engine, state };
}
