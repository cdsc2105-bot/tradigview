import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  Logical,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";
import {
  TOOLS,
  isToolId,
  regressionOf,
  simplifyStroke,
  toolDef,
  volumeProfile,
  type Bar,
  type ChartPoint,
  type Drawing,
  type EngineApi,
  type EngineColors,
  type Geometry,
  type Px,
  type ToolId,
} from "./tools";

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export type MagnetMode = "off" | "weak" | "strong";

/** What the React side renders from (rail, floating bar). */
export interface EngineSnapshot {
  tool: ToolId | null;
  magnet: MagnetMode;
  keepDrawing: boolean;
  selected: Drawing | null;
  canUndo: boolean;
  canRedo: boolean;
  count: number;
}

const HANDLE_R = 5;
const WEAK_MAGNET_PX = 14;
const MAX_HISTORY = 100;
const STORE_PREFIX = "trading-drawings:";

/** Default look of a new drawing and of the engine's labels. */
export const DRAWING_COLORS: EngineColors = {
  text: "#e2e6ee",
  label: "rgba(19, 24, 35, 0.94)",
  onColor: "#ffffff",
  up: "#26a69a",
  down: "#ef4b5a",
  accent: "#2962ff",
  background: "#070b14",
  levels: ["#94a3b8", "#ef4444", "#f59e0b", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#a855f7"],
};

const uid = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Short date for time-axis labels: "29 sep '26 13:30" (local time, like the axis). */
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function shortDate(t: number): string {
  const d = new Date(t * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())} ${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Drag {
  kind: "handle" | "move";
  d: Drawing;
  index: number;
  start?: { l: number | null; p: number | null };
  original?: { l: number; price: number }[];
  moved: boolean;
}

/**
 * TradingView-style drawing tools on a lightweight-charts candle series:
 * places, paints, selects, drags and saves drawings, with undo/redo, a magnet
 * that snaps to OHLC, and axis labels for the selected drawing.
 *
 * Everything draws on the candle pane through one series primitive; input
 * comes from pointer events on the chart container (capture phase, so a
 * drawing grabbed never pans the chart).
 */
export class DrawingEngine {
  private chart: IChartApi;
  private series: ISeriesApi<SeriesType>;
  private container: HTMLElement;

  private bars: Bar[] = [];
  private times: number[] = [];
  private barSeconds = 60;
  private dataKey = "";

  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
  private tool: ToolId | null = null;
  private draft: (Drawing & { _start?: Px; _lastPx?: Px }) | null = null;
  private drag: Drag | null = null;
  private hovering = false;
  private magnet: MagnetMode = "off";
  private keepDrawing = false;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastSaved = "[]";
  private storeKey: string | null = null;
  private chartLocked = false;
  private editor: HTMLTextAreaElement | null = null;

  private listeners = new Set<() => void>();
  private snapshot: EngineSnapshot;
  private requestUpdate: () => void = () => {};
  private cache = new Map<string, { key: string; value: unknown }>();
  private readonly primitive: ISeriesPrimitive<Time>;
  private readonly api: EngineApi;

  constructor(opts: { chart: IChartApi; series: ISeriesApi<SeriesType>; container: HTMLElement }) {
    this.chart = opts.chart;
    this.series = opts.series;
    this.container = opts.container;

    const selected = () => this.selectedId;
    this.api = {
      logicalOf: (t) => this.logicalOf(t),
      timeOf: (l) => this.timeOf(l),
      xOfLogical: (l) => this.xOfLogical(l),
      yOfPrice: (p) => this.yOfPrice(p),
      priceOfY: (y) => this.priceOfY(y),
      formatPrice: (p) => this.formatPrice(p),
      barRange: (a, b) => this.barRange(a, b),
      volumeBetween: (a, b) => this.volumeBetween(a, b),
      anchoredVwap: (d) => this.anchoredVwap(d),
      regression: (d) => this.regression(d),
      profile: (d) => this.profile(d),
      colors: DRAWING_COLORS,
      get selectedId() {
        return selected();
      },
      editText: (d) => this.openTextEditor(d),
    };

    const paneView: IPrimitivePaneView = {
      zOrder: (): PrimitivePaneViewZOrder => "top",
      renderer: () => ({
        draw: (target: DrawTarget) => {
          target.useMediaCoordinateSpace(({ context }) => this.paint(context));
        },
      }),
    };
    this.primitive = {
      attached: (param: SeriesAttachedParameter<Time>) => {
        this.requestUpdate = param.requestUpdate;
      },
      detached: () => {
        this.requestUpdate = () => {};
      },
      paneViews: () => [paneView],
      priceAxisViews: () => this.priceAxisViews(),
      timeAxisViews: () => this.timeAxisViews(),
    };
    this.series.attachPrimitive(this.primitive);

    this.snapshot = this.makeSnapshot();
    this.container.addEventListener("pointerdown", this.onDown, true);
    this.container.addEventListener("dblclick", this.onDoubleClick, true);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    document.addEventListener("keydown", this.onKey);
  }

  destroy() {
    this.closeTextEditor(false);
    this.container.removeEventListener("pointerdown", this.onDown, true);
    this.container.removeEventListener("dblclick", this.onDoubleClick, true);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    document.removeEventListener("keydown", this.onKey);
    try {
      this.series.detachPrimitive(this.primitive);
    } catch {
      // chart already torn down
    }
    this.listeners.clear();
  }

  /* ---- React bridge (useSyncExternalStore) ---- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snapshot;

  private makeSnapshot(): EngineSnapshot {
    const sel = this.drawings.find((d) => d.id === this.selectedId) ?? null;
    return {
      tool: this.tool,
      magnet: this.magnet,
      keepDrawing: this.keepDrawing,
      selected: sel ? { ...sel, style: { ...sel.style } } : null,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      count: this.drawings.length,
    };
  }

  private notify() {
    this.snapshot = this.makeSnapshot();
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        // a broken listener must not stop the engine
      }
    }
  }

  /** True while a tool is armed, a drawing is being placed or dragged, or hovered. */
  isBusy(): boolean {
    return Boolean(this.tool || this.draft || this.drag || this.hovering);
  }

  /* ---- data & storage ---- */

  setData(bars: Bar[]) {
    const last = bars[bars.length - 1];
    const key = `${bars.length}:${bars[0]?.time}:${last?.time}:${last?.close}:${last?.volume}`;
    if (key === this.dataKey) return;
    const reindex = bars.length !== this.bars.length || bars[0]?.time !== this.bars[0]?.time;
    this.dataKey = key;
    this.bars = bars;
    if (reindex || this.times[this.times.length - 1] !== last?.time) {
      this.times = bars.map((b) => b.time);
      const steps: number[] = [];
      for (let i = 1; i < Math.min(this.times.length, 50); i++) steps.push(this.times[i] - this.times[i - 1]);
      steps.sort((a, b) => a - b);
      this.barSeconds = steps.length ? steps[Math.floor(steps.length / 2)] : 60;
    }
    this.requestUpdate();
  }

  /** Switch to another symbol's drawings (each symbol keeps its own). */
  setStoreKey(key: string, migrate?: () => Drawing[]) {
    if (key === this.storeKey) return;
    this.closeTextEditor(true);
    this.storeKey = key;
    this.draft = null;
    this.drag = null;
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];
    let list: Drawing[] = [];
    try {
      const raw = localStorage.getItem(STORE_PREFIX + key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) list = parsed.filter((d) => isToolId(d?.tool) && Array.isArray(d.points));
    } catch {
      // storage blocked or corrupt: start empty
    }
    const carried = migrate?.() ?? [];
    this.drawings = [...list, ...carried];
    this.lastSaved = this.serialize();
    if (carried.length) this.save();
    this.cache.clear();
    this.notify();
    this.requestUpdate();
  }

  private serialize() {
    return JSON.stringify(this.drawings);
  }

  private save() {
    if (!this.storeKey) return;
    try {
      localStorage.setItem(STORE_PREFIX + this.storeKey, this.serialize());
    } catch {
      // storage blocked
    }
  }

  /** One undo step: remember how things were, save, tell the UI. */
  private commit() {
    this.undoStack.push(this.lastSaved);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.lastSaved = this.serialize();
    this.save();
    this.notify();
  }

  private restore(json: string) {
    try {
      this.drawings = JSON.parse(json) || [];
    } catch {
      this.drawings = [];
    }
    if (!this.drawings.some((d) => d.id === this.selectedId)) this.selectedId = null;
    this.lastSaved = this.serialize();
    this.cache.clear();
    this.save();
    this.notify();
    this.requestUpdate();
  }

  undo() {
    const prev = this.undoStack.pop();
    if (prev === undefined) return;
    this.redoStack.push(this.serialize());
    this.restore(prev);
  }

  redo() {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(this.serialize());
    this.restore(next);
  }

  /* ---- coordinates ---- */

  private logicalOf(t: number): number {
    const ts = this.times;
    const n = ts.length;
    if (!n) return 0;
    if (t >= ts[n - 1]) return n - 1 + (t - ts[n - 1]) / this.barSeconds;
    if (t <= ts[0]) return (t - ts[0]) / this.barSeconds;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= t) lo = mid;
      else hi = mid;
    }
    return lo + (t - ts[lo]) / (ts[hi] - ts[lo]);
  }

  private timeOf(logical: number): number {
    const ts = this.times;
    const n = ts.length;
    const l = Math.round(logical);
    if (!n) return 0;
    if (l >= n - 1) return ts[n - 1] + (l - (n - 1)) * this.barSeconds;
    if (l <= 0) return ts[0] + l * this.barSeconds;
    return ts[l];
  }

  private xOfLogical(l: number): number | null {
    return this.chart.timeScale().logicalToCoordinate(l as Logical);
  }

  private xOfTime(t: number): number | null {
    return this.xOfLogical(this.logicalOf(t));
  }

  private yOfPrice(p: number): number | null {
    return this.series.priceToCoordinate(p);
  }

  private priceOfY(y: number): number | null {
    return this.series.coordinateToPrice(y);
  }

  private formatPrice(p: number): string {
    try {
      return this.series.priceFormatter().format(p);
    } catch {
      return p.toFixed(2);
    }
  }

  private barRange(t1: number, t2: number): [number, number] {
    const a = Math.round(this.logicalOf(t1));
    const b = Math.round(this.logicalOf(t2));
    return [Math.min(a, b), Math.max(a, b)];
  }

  private volumeBetween(from: number, to: number): number {
    let v = 0;
    for (let i = Math.max(0, from); i <= Math.min(this.bars.length - 1, to); i++) v += this.bars[i].volume || 0;
    return v;
  }

  /** Candle-derived results per drawing, recomputed when the data or points move. */
  private cached<T>(d: Drawing, kind: string, key: string, compute: () => T): T {
    const k = `${kind}:${d.id}`;
    const hit = this.cache.get(k);
    const full = `${key}|${this.dataKey}`;
    if (hit && hit.key === full) return hit.value as T;
    const value = compute();
    this.cache.set(k, { key: full, value });
    return value;
  }

  private anchoredVwap(d: Drawing) {
    const start = Math.max(0, Math.ceil(this.logicalOf(d.points[0].time) - 1e-9));
    return this.cached(d, "vwap", String(start), () => {
      const out: { l: number; v: number }[] = [];
      let pv = 0;
      let vol = 0;
      for (let i = start; i < this.bars.length; i++) {
        const b = this.bars[i];
        const v = b.volume || 0;
        pv += ((b.high + b.low + b.close) / 3) * v;
        vol += v;
        if (vol > 0) out.push({ l: i, v: pv / vol });
      }
      return out;
    });
  }

  private regression(d: Drawing) {
    if (d.points.length < 2) return null;
    const [i0, i1] = this.barRange(d.points[0].time, d.points[1].time);
    return this.cached(d, "reg", `${i0}:${i1}`, () => regressionOf(this.bars, i0, i1));
  }

  private profile(d: Drawing) {
    if (d.points.length < 2) return null;
    const t0 = d.points[0].time;
    const t1 = d.points[1].time;
    return this.cached(d, "vp", `${t0}:${t1}`, () => volumeProfile(this.bars, t0, t1));
  }

  private paneHeight(): number {
    try {
      return this.chart.panes()[0]?.getHeight() ?? this.container.clientHeight;
    } catch {
      return this.container.clientHeight;
    }
  }

  private geometry(d: Drawing, points: ChartPoint[] = d.points): Geometry | null {
    const pts: Px[] = [];
    for (const p of points) {
      const x = this.xOfTime(p.time);
      const y = this.yOfPrice(p.price);
      if (x === null || y === null) return null;
      pts.push({ x, y });
    }
    return { pts, width: this.chart.timeScale().width(), height: this.paneHeight() };
  }

  /** Chart point under a pixel; the magnet snaps it to the candle's OHLC. */
  private pointAt(x: number, y: number): ChartPoint | null {
    const logical = this.chart.timeScale().coordinateToLogical(x);
    const price = this.priceOfY(y);
    if (logical === null || price === null) return null;
    const l = Math.round(logical);
    const p: ChartPoint = { time: this.timeOf(l), price };
    if (this.magnet === "off" || l < 0 || l >= this.bars.length) return p;
    const b = this.bars[l];
    let best: { v: number; dy: number } | null = null;
    for (const v of [b.open, b.high, b.low, b.close]) {
      const yy = this.yOfPrice(v);
      if (yy === null) continue;
      const dy = Math.abs(yy - y);
      if (!best || dy < best.dy) best = { v, dy };
    }
    if (best && (this.magnet === "strong" || best.dy <= WEAK_MAGNET_PX)) p.price = best.v;
    return p;
  }

  /* ---- painting ---- */

  private paint(ctx: CanvasRenderingContext2D) {
    const list = this.draft ? [...this.drawings, this.draft] : this.drawings;
    for (const d of list) {
      if (d.hidden) continue;
      const g = this.geometry(d);
      if (!g) continue;
      ctx.save();
      try {
        toolDef(d.tool).draw(ctx, d, g, this.api);
      } catch {
        // one odd drawing must not stop the rest from painting
      } finally {
        ctx.restore();
      }
      if (d.id === this.selectedId || d === this.draft) this.paintHandles(ctx, d, g);
    }
  }

  private handlesOf(d: Drawing, g: Geometry): Px[] {
    const def = toolDef(d.tool);
    if (def.points === "free") return [];
    if (def.handles && d.points.length >= def.points) return def.handles(d, g);
    return g.pts;
  }

  private paintHandles(ctx: CanvasRenderingContext2D, d: Drawing, g: Geometry) {
    ctx.save();
    for (const h of this.handlesOf(d, g)) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = DRAWING_COLORS.background;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = d.locked ? DRAWING_COLORS.text : d.style.color;
      ctx.stroke();
    }
    ctx.restore();
  }

  private axisView(coordinate: number, text: string, color: string): ISeriesPrimitiveAxisView {
    return {
      coordinate: () => coordinate,
      text: () => text,
      textColor: () => DRAWING_COLORS.onColor,
      backColor: () => color,
      visible: () => true,
      tickVisible: () => true,
    };
  }

  /** Each tool's fixed labels, plus the selected drawing's points (TradingView-like). */
  private priceAxisViews(): ISeriesPrimitiveAxisView[] {
    const out: ISeriesPrimitiveAxisView[] = [];
    for (const d of this.drawings) {
      if (d.hidden) continue;
      const def = toolDef(d.tool);
      let prices = def.priceAxis ? def.priceAxis(d, this.api) : [];
      if (d.id === this.selectedId && !def.priceAxis) prices = prices.concat(d.points.map((p) => p.price));
      for (const p of prices) {
        const y = this.yOfPrice(p);
        if (y !== null) out.push(this.axisView(y, this.formatPrice(p), d.style.color));
      }
    }
    return out;
  }

  private timeAxisViews(): ISeriesPrimitiveAxisView[] {
    const out: ISeriesPrimitiveAxisView[] = [];
    for (const d of this.drawings) {
      if (d.hidden) continue;
      const def = toolDef(d.tool);
      let times = def.timeAxis ? def.timeAxis(d) : [];
      if (d.id === this.selectedId && !def.timeAxis && !def.priceAxis) times = times.concat(d.points.map((p) => p.time));
      for (const t of new Set(times)) {
        const x = this.xOfTime(t);
        if (x !== null) out.push(this.axisView(x, shortDate(t), d.style.color));
      }
    }
    return out;
  }

  /* ---- picking ---- */

  private selected(): Drawing | null {
    return this.drawings.find((d) => d.id === this.selectedId) ?? null;
  }

  private hitHandle(x: number, y: number): { d: Drawing; index: number } | null {
    const d = this.selected();
    if (!d || d.hidden) return null;
    const g = this.geometry(d);
    if (!g) return null;
    const hs = this.handlesOf(d, g);
    for (let i = 0; i < hs.length; i++) {
      if (Math.hypot(x - hs[i].x, y - hs[i].y) <= HANDLE_R + 4) return { d, index: i };
    }
    return null;
  }

  private hitDrawing(x: number, y: number): Drawing | null {
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      if (d.hidden) continue;
      const g = this.geometry(d);
      try {
        if (g && toolDef(d.tool).hit(d, g, x, y, this.api)) return d;
      } catch {
        // incomplete drawing
      }
    }
    return null;
  }

  /* ---- input ---- */

  /** Freeze panning while drawing or over a drawing (the wheel still zooms). */
  private syncChartLock() {
    const lock = this.isBusy();
    this.container.style.cursor = this.drag
      ? "grabbing"
      : this.hovering
        ? "pointer"
        : this.tool
          ? "crosshair"
          : "";
    if (lock === this.chartLocked) return;
    this.chartLocked = lock;
    this.chart.applyOptions({
      handleScroll: lock
        ? { mouseWheel: true, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false }
        : true,
      handleScale: lock
        ? { mouseWheel: true, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: true }
        : true,
    });
  }

  private localPos(ev: PointerEvent | MouseEvent) {
    const r = this.container.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    const inside = x >= 0 && x <= this.chart.timeScale().width() && y >= 0 && y <= this.paneHeight();
    return { x, y, inside };
  }

  private newDrawing(tool: ToolId, p: ChartPoint): Drawing {
    return {
      id: uid(),
      tool,
      points: [p],
      style: { color: DRAWING_COLORS.accent, width: 2 },
      locked: false,
      hidden: false,
    };
  }

  private finishDraft() {
    const d = this.draft;
    if (!d) return;
    this.draft = null;
    delete d._start;
    delete d._lastPx;
    const def = toolDef(d.tool);
    const clean: Drawing = { ...d };
    this.drawings.push(clean);
    this.selectedId = clean.id;
    if (!this.keepDrawing) this.tool = null;
    def.onCreate?.(clean, this.api);
    this.commit();
    this.syncChartLock();
    this.requestUpdate();
  }

  private finishBrush() {
    const d = this.draft;
    if (!d) return;
    this.draft = null;
    const pts = d.points
      .map((p) => ({ ...p, x: this.xOfTime(p.time), y: this.yOfPrice(p.price) }))
      .filter((p): p is ChartPoint & Px => p.x !== null && p.y !== null);
    const simplified = simplifyStroke(pts, 1).map(({ time, price }) => ({ time, price }));
    if (simplified.length >= 2) {
      const clean: Drawing = { id: d.id, tool: d.tool, points: simplified, style: d.style, locked: false, hidden: false };
      this.drawings.push(clean);
      this.selectedId = clean.id;
      if (!this.keepDrawing) this.tool = null;
      this.commit();
    }
    this.syncChartLock();
    this.requestUpdate();
  }

  /** Pin the provisional point; open the next one if the tool needs more. */
  private confirmPoint(p: ChartPoint) {
    const d = this.draft;
    if (!d) return;
    const need = toolDef(d.tool).points;
    d.points[d.points.length - 1] = p;
    if (typeof need === "number" && d.points.length >= need) this.finishDraft();
    else if (typeof need === "number") d.points.push({ ...p });
  }

  private onDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if (this.editor && ev.target === this.editor) return;
    const pos = this.localPos(ev);
    if (!pos.inside) return;
    const p = this.pointAt(pos.x, pos.y);
    if (!p) return;

    if (this.tool) {
      const def = toolDef(this.tool);
      ev.preventDefault();
      ev.stopPropagation();
      if (def.points === "free") {
        if (!this.draft) {
          this.draft = this.newDrawing(this.tool, p);
          this.draft._lastPx = { x: pos.x, y: pos.y };
        }
      } else if (!this.draft) {
        this.draft = this.newDrawing(this.tool, p);
        this.draft._start = { x: pos.x, y: pos.y };
        if (def.points === 1) this.finishDraft();
        else this.draft.points.push({ ...p });
      } else {
        this.confirmPoint(p);
      }
      this.syncChartLock();
      this.requestUpdate();
      return;
    }

    const handle = this.hitHandle(pos.x, pos.y);
    if (handle && !handle.d.locked) {
      ev.preventDefault();
      ev.stopPropagation();
      this.drag = { kind: "handle", d: handle.d, index: handle.index, moved: false };
      this.syncChartLock();
      return;
    }
    const d = this.hitDrawing(pos.x, pos.y);
    const before = this.selectedId;
    this.selectedId = d ? d.id : null;
    if (d) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!d.locked) {
        this.drag = {
          kind: "move",
          d,
          index: -1,
          start: { l: this.chart.timeScale().coordinateToLogical(pos.x), p: this.priceOfY(pos.y) },
          original: d.points.map((q) => ({ l: this.logicalOf(q.time), price: q.price })),
          moved: false,
        };
      }
    }
    this.syncChartLock();
    if (before !== this.selectedId) this.notify();
    this.requestUpdate();
  };

  private onMove = (ev: PointerEvent) => {
    const pos = this.localPos(ev);
    if (this.draft) {
      const p = this.pointAt(pos.x, pos.y);
      if (!p) return;
      if (toolDef(this.draft.tool).points === "free") {
        const last = this.draft._lastPx;
        if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) >= 3) {
          this.draft.points.push(p);
          this.draft._lastPx = { x: pos.x, y: pos.y };
          this.requestUpdate();
        }
        return;
      }
      this.draft.points[this.draft.points.length - 1] = p;
      this.cache.clear();
      this.requestUpdate();
      return;
    }
    if (this.drag) {
      const a = this.drag;
      if (a.kind === "handle") {
        const p = this.pointAt(pos.x, pos.y);
        if (p) {
          const def = toolDef(a.d.tool);
          if (def.moveHandle) def.moveHandle(a.d, a.index, p);
          else a.d.points[a.index] = p;
        }
      } else if (a.start && a.original) {
        const l = this.chart.timeScale().coordinateToLogical(pos.x);
        const price = this.priceOfY(pos.y);
        if (l !== null && price !== null && a.start.l !== null && a.start.p !== null) {
          const dl = Math.round(l - a.start.l);
          const dp = price - a.start.p;
          a.d.points = a.original.map((o) => ({ time: this.timeOf(o.l + dl), price: o.price + dp }));
        }
      }
      a.moved = true;
      this.syncChartLock();
      this.requestUpdate();
      return;
    }
    if (!pos.inside) {
      if (this.hovering) {
        this.hovering = false;
        this.syncChartLock();
      }
      return;
    }
    const over = Boolean(this.hitHandle(pos.x, pos.y) || this.hitDrawing(pos.x, pos.y));
    if (over !== this.hovering) {
      this.hovering = over;
      this.syncChartLock();
    }
  };

  private onUp = (ev: PointerEvent) => {
    if (this.draft && toolDef(this.draft.tool).points === "free") {
      this.finishBrush();
      return;
    }
    if (this.draft?._start) {
      // Press-drag-release places the next point where the pointer was let go
      const start = this.draft._start;
      delete this.draft._start;
      const pos = this.localPos(ev);
      if (Math.hypot(pos.x - start.x, pos.y - start.y) > 6) {
        const p = this.pointAt(pos.x, pos.y);
        if (p) {
          this.confirmPoint(p);
          this.requestUpdate();
          return;
        }
      }
    }
    if (this.drag) {
      const moved = this.drag.moved;
      this.drag = null;
      if (moved) {
        this.cache.clear();
        this.commit();
      }
    }
    // A finger lift leaves a synthetic hover that would keep panning locked
    if (ev.pointerType === "touch") this.hovering = false;
    this.syncChartLock();
  };

  private onDoubleClick = (ev: MouseEvent) => {
    const pos = this.localPos(ev);
    if (!pos.inside || this.tool) return;
    const d = this.hitDrawing(pos.x, pos.y);
    if (d && toolDef(d.tool).editable && !d.locked) {
      ev.preventDefault();
      ev.stopPropagation();
      this.openTextEditor(d);
    }
  };

  private onKey = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (ev.altKey) {
      const letter = ev.code?.startsWith("Key") ? ev.code.slice(3).toLowerCase() : key;
      const combo = `alt+${ev.shiftKey ? "shift+" : ""}${letter}`;
      const hit = (Object.keys(TOOLS) as ToolId[]).find((id) => toolDef(id).shortcut?.toLowerCase() === combo);
      if (hit) {
        ev.preventDefault();
        this.setTool(hit);
        return;
      }
    }
    if ((ev.ctrlKey || ev.metaKey) && key === "z" && !ev.shiftKey) {
      ev.preventDefault();
      this.undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && (key === "y" || (key === "z" && ev.shiftKey))) {
      ev.preventDefault();
      this.redo();
      return;
    }
    if (ev.key === "Escape") {
      if (this.draft || this.tool) this.setTool(null);
      else if (this.selectedId) {
        this.selectedId = null;
        this.notify();
        this.requestUpdate();
      }
      return;
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && this.selectedId) {
      ev.preventDefault();
      this.remove();
    }
  };

  /* ---- text editing on the chart ---- */

  private openTextEditor(d: Drawing) {
    this.closeTextEditor(false);
    const g = this.geometry(d);
    if (!g) return;
    const host = this.container.parentElement ?? this.container;
    const rc = this.container.getBoundingClientRect();
    const rh = host.getBoundingClientRect();
    const ed = document.createElement("textarea");
    ed.value = d.text ?? "";
    ed.rows = Math.max(1, (d.text ?? "").split("\n").length);
    ed.setAttribute("aria-label", "Texto del dibujo");
    ed.dataset.drawing = d.id;
    Object.assign(ed.style, {
      position: "absolute",
      zIndex: "40",
      left: `${g.pts[0].x + rc.left - rh.left}px`,
      top: `${g.pts[0].y + rc.top - rh.top - 4}px`,
      minWidth: "160px",
      padding: "4px 6px",
      resize: "both",
      background: "#131823",
      color: "#e2e6ee",
      border: `1px solid ${d.style.color}`,
      borderRadius: "4px",
      font: "14px ui-sans-serif, system-ui, sans-serif",
      outline: "none",
    });
    ed.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.closeTextEditor(true);
      }
      if (e.key === "Escape") this.closeTextEditor(false);
    });
    ed.addEventListener("blur", () => this.closeTextEditor(true));
    host.append(ed);
    this.editor = ed;
    ed.focus();
    ed.select();
  }

  private closeTextEditor(apply: boolean) {
    const ed = this.editor;
    if (!ed) return;
    this.editor = null;
    const d = this.drawings.find((x) => x.id === ed.dataset.drawing);
    if (apply && d && ed.value.trim() && ed.value !== d.text) {
      d.text = ed.value;
      this.commit();
    }
    ed.remove();
    this.requestUpdate();
  }

  /* ---- public actions (rail and floating bar) ---- */

  setTool(tool: ToolId | null) {
    this.tool = tool;
    this.draft = null;
    this.syncChartLock();
    this.notify();
    this.requestUpdate();
  }

  setMagnet(mode: MagnetMode) {
    this.magnet = mode;
    this.notify();
  }

  setKeepDrawing(v: boolean) {
    this.keepDrawing = v;
    this.notify();
  }

  private withSelected(fn: (d: Drawing) => void) {
    const d = this.selected();
    if (!d) return;
    fn(d);
    this.commit();
    this.requestUpdate();
  }

  setColor(color: string) {
    this.withSelected((d) => {
      d.style = { ...d.style, color };
    });
  }

  setWidth(width: number) {
    this.withSelected((d) => {
      d.style = { ...d.style, width };
    });
  }

  toggleLock() {
    this.withSelected((d) => {
      d.locked = !d.locked;
    });
  }

  editSelectedText() {
    const d = this.selected();
    if (d && toolDef(d.tool).editable) this.openTextEditor(d);
  }

  /** Copy a few bars to the right so it shows, like TradingView. */
  clone() {
    const d = this.selected();
    if (!d) return;
    const copy: Drawing = JSON.parse(JSON.stringify(d));
    copy.id = uid();
    copy.locked = false;
    copy.points = copy.points.map((p) => ({ ...p, time: this.timeOf(this.logicalOf(p.time) + 5) }));
    this.drawings.push(copy);
    this.selectedId = copy.id;
    this.commit();
    this.requestUpdate();
  }

  remove() {
    const d = this.selected();
    if (!d || d.locked) return;
    this.drawings = this.drawings.filter((x) => x !== d);
    this.selectedId = null;
    this.commit();
    this.requestUpdate();
  }

  hideAll() {
    const hide = this.drawings.some((d) => !d.hidden);
    this.drawings.forEach((d) => (d.hidden = hide));
    if (hide) this.selectedId = null;
    this.commit();
    this.requestUpdate();
  }

  lockAll() {
    const lock = this.drawings.some((d) => !d.locked);
    this.drawings.forEach((d) => (d.locked = lock));
    this.commit();
    this.requestUpdate();
  }

  /** Everything except locked drawings. */
  deleteAll() {
    if (!this.drawings.length) return;
    this.drawings = this.drawings.filter((d) => d.locked);
    this.selectedId = null;
    this.commit();
    this.requestUpdate();
  }

  get allHidden() {
    return this.drawings.length > 0 && this.drawings.every((d) => d.hidden);
  }

  get allLocked() {
    return this.drawings.length > 0 && this.drawings.every((d) => d.locked);
  }
}

/* ---- the one engine the UI talks to ------------------------------------- */

let current: DrawingEngine | null = null;
const holders = new Set<() => void>();

export function setDrawingEngine(e: DrawingEngine | null) {
  current = e;
  holders.forEach((fn) => fn());
}

export const drawingEngineStore = {
  subscribe(fn: () => void) {
    holders.add(fn);
    return () => {
      holders.delete(fn);
    };
  },
  get: () => current,
};
