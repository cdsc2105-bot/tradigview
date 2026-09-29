/**
 * Drawing tool catalog: how each tool is placed, painted, hit-tested and
 * edited. Pure canvas code — the engine (engine.ts) owns state and input and
 * hands every tool the drawing's points already projected to pixels.
 *
 * Points are { time, price } pinned to candles, as on TradingView; the engine
 * extrapolates by bar length past the last candle.
 */

export interface ChartPoint {
  time: number;
  price: number;
}

export interface Px {
  x: number;
  y: number;
}

export interface DrawingStyle {
  color: string;
  width: number;
}

export interface Drawing {
  id: string;
  tool: ToolId;
  points: ChartPoint[];
  style: DrawingStyle;
  locked: boolean;
  hidden: boolean;
  text?: string;
}

/** Projected geometry: points in pixels plus the pane size. */
export interface Geometry {
  pts: Px[];
  width: number;
  height: number;
}

export interface EngineColors {
  text: string;
  label: string;
  onColor: string;
  up: string;
  down: string;
  accent: string;
  background: string;
  levels: string[];
}

export interface VolumeProfileRow {
  low: number;
  high: number;
  up: number;
  down: number;
  total: number;
  inValueArea: boolean;
}

export interface VolumeProfile {
  rows: VolumeProfileRow[];
  poc: number;
  vah: number;
  val: number;
  min: number;
  max: number;
}

export interface Regression {
  i0: number;
  i1: number;
  /** Close predicted at bar i0, and slope per bar */
  a: number;
  b: number;
  sigma: number;
  pearson: number;
}

/** What the engine offers tools: coordinate maps, formatting and candle math. */
export interface EngineApi {
  logicalOf(time: number): number;
  timeOf(logical: number): number;
  xOfLogical(logical: number): number | null;
  yOfPrice(price: number): number | null;
  priceOfY(y: number): number | null;
  formatPrice(price: number): string;
  barRange(t1: number, t2: number): [number, number];
  volumeBetween(from: number, to: number): number;
  anchoredVwap(d: Drawing): { l: number; v: number }[];
  regression(d: Drawing): Regression | null;
  profile(d: Drawing): VolumeProfile | null;
  colors: EngineColors;
  selectedId: string | null;
  editText(d: Drawing): void;
}

type Ctx = CanvasRenderingContext2D;

export interface ToolDef {
  name: string;
  shortcut?: string;
  /** Clicks needed to place it, or "free" for a freehand stroke */
  points: number | "free";
  draw(ctx: Ctx, d: Drawing, g: Geometry, m: EngineApi): void;
  hit(d: Drawing, g: Geometry, x: number, y: number, m: EngineApi): boolean;
  /** Where the edit handles sit (default: every point) */
  handles?(d: Drawing, g: Geometry): Px[];
  /** What dragging handle `i` does (default: moves that point) */
  moveHandle?(d: Drawing, i: number, p: ChartPoint): void;
  /** Prices always labelled on the price axis */
  priceAxis?(d: Drawing, m: EngineApi): number[];
  /** Times always labelled on the time axis */
  timeAxis?(d: Drawing): number[];
  /** Finish a freshly placed drawing (extra points, default text…) */
  onCreate?(d: Drawing, m: EngineApi): void;
  /** Has an editable text */
  editable?: boolean;
}

/** Pixel slack for picking a line. */
export const HIT = 6;

/* ---- geometry & paint helpers ------------------------------------------- */

export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  let r = 0;
  let g = 0;
  let b = 0;
  if (c.startsWith("#")) {
    const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join("") : c.slice(1, 7);
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const n = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
    [r, g, b] = n;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function distToSegment(px: number, py: number, a: Px, b: Px): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len)) : 0;
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function nearPolyline(pts: Px[], x: number, y: number, closed = false): boolean {
  const list = closed ? [...pts, pts[0]] : pts;
  for (let i = 1; i < list.length; i++) {
    if (distToSegment(x, y, list[i - 1], list[i]) <= HIT) return true;
  }
  return false;
}

/** Stretch a→b off-screen: both ways for an extended line, forward for a ray. */
function extend(a: Px, b: Px, width: number, bothWays: boolean): [Px, Px] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const n = Math.hypot(dx, dy);
  if (n < 1e-9) return [a, b];
  const far = Math.max(width, 1) * 4;
  const ux = dx / n;
  const uy = dy / n;
  const start = bothWays ? { x: a.x - ux * far, y: a.y - uy * far } : a;
  return [start, { x: b.x + ux * far, y: b.y + uy * far }];
}

function boxOf(pts: Px[]) {
  const [a, b] = pts;
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function inBox(pts: Px[], x: number, y: number): boolean {
  const r = boxOf(pts);
  return x >= r.x - HIT && x <= r.x + r.w + HIT && y >= r.y - HIT && y <= r.y + r.h + HIT;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const inRect = (r: Rect | undefined, x: number, y: number) =>
  !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Painted bounds of text-like drawings, remembered for hit-testing. */
const boundsCache = new WeakMap<Drawing, Rect>();

function stroke(ctx: Ctx, d: Drawing, a: Px, b: Px, o: { dashed?: boolean; width?: number; color?: string } = {}) {
  ctx.save();
  ctx.strokeStyle = o.color ?? d.style.color;
  ctx.lineWidth = o.width ?? d.style.width;
  ctx.lineCap = "round";
  if (o.dashed) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function polyline(ctx: Ctx, color: string, width: number, pts: Px[], o: { closed?: boolean; fill?: string } = {}) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (o.closed) ctx.closePath();
  if (o.fill) {
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  if (width > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.restore();
}

function arrowHead(ctx: Ctx, from: Px, to: Px, color: string, size = 8) {
  if (Math.hypot(to.x - from.x, to.y - from.y) < size * 1.5) return;
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(ang - 0.45), to.y - size * Math.sin(ang - 0.45));
  ctx.lineTo(to.x - size * Math.cos(ang + 0.45), to.y - size * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** A rounded box of text lines; returns its bounds. */
function tag(
  ctx: Ctx,
  lines: string[],
  x: number,
  y: number,
  o: { bg?: string; fg: string; align?: "center" | "left" | "right"; anchor?: "middle" | "top" | "bottom"; size?: number },
): Rect {
  const size = o.size ?? 12;
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  const lineH = size + 5;
  const pad = 7;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const h = lines.length * lineH + 6;
  const align = o.align ?? "center";
  const anchor = o.anchor ?? "middle";
  const bx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  const by = anchor === "middle" ? y - h / 2 : anchor === "bottom" ? y - h : y;
  if (o.bg) {
    ctx.fillStyle = o.bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, w, h, 4);
    else ctx.rect(bx, by, w, h);
    ctx.fill();
  }
  ctx.fillStyle = o.fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + 3 + lineH * i + lineH / 2));
  ctx.restore();
  return { x: bx, y: by, w, h };
}

/** Bare text (level names, pattern letters). */
function caption(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  color: string,
  o: { align?: CanvasTextAlign; baseline?: CanvasTextBaseline; size?: number; bold?: boolean } = {},
) {
  ctx.save();
  ctx.font = `${o.bold ? "600 " : ""}${o.size ?? 11}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = o.baseline ?? "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

const sign = (v: number) => (v >= 0 ? "+" : "");
const ratio = (a: number, b: number) => (Math.abs(b) > 1e-12 ? Math.abs(a / b) : 0);

export function durationLabel(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function volumeLabel(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
}

const changeLabel = (m: EngineApi, from: number, to: number) => {
  const delta = to - from;
  const pct = from ? (delta / from) * 100 : 0;
  return `${sign(delta)}${m.formatPrice(delta)} (${sign(pct)}${pct.toFixed(2)}%)`;
};

/** Coloured horizontal levels with tinted bands between them (Fib tools). */
function fibLevels(
  ctx: Ctx,
  levels: { i: number; k: number; price: number; y: number }[],
  x1: number,
  x2: number,
  m: EngineApi,
) {
  const color = (i: number) => m.colors.levels[i % m.colors.levels.length];
  const sorted = [...levels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    ctx.fillStyle = withAlpha(color(sorted[i].i), 0.08);
    ctx.fillRect(x1, sorted[i - 1].y, x2 - x1, sorted[i].y - sorted[i - 1].y);
  }
  for (const n of levels) {
    ctx.save();
    ctx.strokeStyle = color(n.i);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, n.y);
    ctx.lineTo(x2, n.y);
    ctx.stroke();
    ctx.restore();
    caption(ctx, `${n.k} (${m.formatPrice(n.price)})`, x1 - 6, n.y, color(n.i), { align: "right" });
  }
}

/** Letters at the vertices: above highs, below lows. */
function vertexLetters(ctx: Ctx, pts: Px[], letters: string[], d: Drawing, m: EngineApi) {
  pts.forEach((p, i) => {
    if (!letters[i]) return;
    const around = [pts[i - 1], pts[i + 1]].filter(Boolean) as Px[];
    const isHigh = around.length ? around.every((q) => p.y <= q.y) : true;
    tag(ctx, [letters[i]], p.x, p.y + (isHigh ? -8 : 8), {
      bg: d.style.color,
      fg: m.colors.onColor,
      anchor: isHigh ? "bottom" : "top",
      size: 11,
    });
  });
}

/** Pattern tool: legs, dashed Fib ratios between swings and vertex letters. */
function pattern(name: string, count: number, letters: string[], legs: [number, number, number, number, number][] = [], shade = false): ToolDef {
  return {
    name,
    points: count,
    draw(ctx, d, g, m) {
      const p = g.pts;
      if (shade) {
        const fill = withAlpha(d.style.color, 0.14);
        if (p.length >= 3) polyline(ctx, d.style.color, 0, [p[0], p[1], p[2]], { closed: true, fill });
        if (p.length >= 5) polyline(ctx, d.style.color, 0, [p[2], p[3], p[4]], { closed: true, fill });
      }
      polyline(ctx, d.style.color, d.style.width, p);
      const pr = d.points.map((q) => q.price);
      // [from vertex, to vertex, numerator swing a→b, denominator swing c→d]
      for (const [i, j, a, b, c] of legs) {
        if (!p[j]) continue;
        stroke(ctx, d, p[i], p[j], { dashed: true, width: 1 });
        const r = ratio(pr[b] - pr[a], pr[a] - pr[c]);
        tag(ctx, [r.toFixed(3)], (p[i].x + p[j].x) / 2, (p[i].y + p[j].y) / 2, {
          bg: m.colors.label,
          fg: m.colors.text,
          size: 11,
        });
      }
      vertexLetters(ctx, p, letters, d, m);
    },
    hit: (d, g, x, y) => nearPolyline(g.pts, x, y),
  };
}

/** Long or short position: entry, target and stop, sized from the entry. */
function position(long: boolean): ToolDef {
  return {
    name: long ? "Posición larga" : "Posición corta",
    points: 1,
    onCreate(d, m) {
      const e = d.points[0];
      const y = m.yOfPrice(e.price);
      const end = m.timeOf(m.logicalOf(e.time) + 24);
      const target = (y !== null ? m.priceOfY(y + (long ? -70 : 70)) : null) ?? e.price * (long ? 1.02 : 0.98);
      const stop = (y !== null ? m.priceOfY(y + (long ? 45 : -45)) : null) ?? e.price * (long ? 0.99 : 1.01);
      d.points = [e, { time: end, price: target }, { time: end, price: stop }];
    },
    draw(ctx, d, g, m) {
      const [e, o, s] = g.pts;
      if (!o || !s) return;
      const x1 = Math.min(e.x, o.x);
      const x2 = Math.max(e.x, o.x);
      ctx.fillStyle = withAlpha(m.colors.up, 0.2);
      ctx.fillRect(x1, Math.min(e.y, o.y), x2 - x1, Math.abs(o.y - e.y));
      ctx.fillStyle = withAlpha(m.colors.down, 0.2);
      ctx.fillRect(x1, Math.min(e.y, s.y), x2 - x1, Math.abs(s.y - e.y));
      stroke(ctx, d, { x: x1, y: e.y }, { x: x2, y: e.y }, { width: 1, color: m.colors.text });
      const [pe, po, ps] = d.points.map((p) => p.price);
      const win = Math.abs(po - pe);
      const loss = Math.abs(pe - ps);
      const pct = (v: number) => (pe ? (v / pe) * 100 : 0).toFixed(2);
      const cx = (x1 + x2) / 2;
      tag(ctx, [`Objetivo: ${m.formatPrice(win)} (${pct(win)}%)`], cx, o.y + (long ? -4 : 4), {
        bg: m.colors.up,
        fg: m.colors.onColor,
        anchor: long ? "bottom" : "top",
      });
      tag(ctx, [`Stop: ${m.formatPrice(loss)} (${pct(loss)}%)`], cx, s.y + (long ? 4 : -4), {
        bg: m.colors.down,
        fg: m.colors.onColor,
        anchor: long ? "top" : "bottom",
      });
      tag(ctx, [`${long ? "Largo" : "Corto"} · R/R ${loss ? (win / loss).toFixed(2) : "—"}`], cx, e.y, {
        bg: m.colors.label,
        fg: m.colors.text,
      });
    },
    hit(d, g, x, y) {
      const [e, o, s] = g.pts;
      if (!o || !s) return false;
      const x1 = Math.min(e.x, o.x);
      const x2 = Math.max(e.x, o.x);
      return x >= x1 - HIT && x <= x2 + HIT && y >= Math.min(o.y, s.y) - HIT && y <= Math.max(o.y, s.y) + HIT;
    },
    handles: (d, g) => g.pts.slice(0, 3),
    moveHandle(d, i, p) {
      const [e, o, s] = d.points;
      if (i === 0) {
        d.points[0] = { ...p };
        return;
      }
      // Target and stop share the right edge; dragging either moves it.
      const end = p.time > e.time ? p.time : o.time;
      if (i === 1) o.price = p.price;
      else s.price = p.price;
      o.time = end;
      s.time = end;
    },
  };
}

/** Up / down arrow marker, green or red. */
function arrowMark(up: boolean): ToolDef {
  return {
    name: up ? "Marca de flecha arriba" : "Marca de flecha abajo",
    points: 1,
    onCreate(d, m) {
      d.style.color = up ? m.colors.up : m.colors.down;
    },
    draw(ctx, d, g) {
      const a = g.pts[0];
      const s = up ? 1 : -1;
      ctx.fillStyle = d.style.color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + 9, a.y + s * 10);
      ctx.lineTo(a.x + 4, a.y + s * 10);
      ctx.lineTo(a.x + 4, a.y + s * 22);
      ctx.lineTo(a.x - 4, a.y + s * 22);
      ctx.lineTo(a.x - 4, a.y + s * 10);
      ctx.lineTo(a.x - 9, a.y + s * 10);
      ctx.closePath();
      ctx.fill();
      boundsCache.set(d, { x: a.x - 10, y: Math.min(a.y, a.y + s * 22) - 2, w: 20, h: 26 });
    },
    hit: (d, g, x, y) => inRect(boundsCache.get(d), x, y),
  };
}

/** Smoothed freehand stroke through the sampled points. */
function smoothStroke(ctx: Ctx, pts: Px[], color: string, width: number) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) ctx.lineTo(pts[1].x, pts[1].y);
  else {
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    }
    const n = pts.length - 1;
    ctx.quadraticCurveTo(pts[n - 1].x, pts[n - 1].y, pts[n].x, pts[n].y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Parallel-channel offset: how far the third point sits off the a→b line. */
function channelOffset(a: Px, b: Px, c: Px): number {
  const t = Math.abs(b.x - a.x) > 1e-6 ? (c.x - a.x) / (b.x - a.x) : 0;
  return c.y - (a.y + t * (b.y - a.y));
}

const FIB_RETRACEMENT = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
const FIB_EXTENSION = [0, 0.382, 0.618, 1, 1.272, 1.618, 2.618];
const FIB_TIME = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const GANN = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];

function pitchforkLines(g: Geometry): [Px, Px][] {
  const [a, b, c] = g.pts;
  const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
  const dx = mid.x - a.x;
  const dy = mid.y - a.y;
  const k = (g.width * 4) / (Math.hypot(dx, dy) || 1);
  const far = (p: Px) => ({ x: p.x + dx * k, y: p.y + dy * k });
  return [
    [a, far(mid)],
    [b, far(b)],
    [c, far(c)],
  ];
}

/* ---- the catalog --------------------------------------------------------- */

export const TOOLS = {
  // ── Lines ──
  trend: {
    name: "Línea de tendencia",
    shortcut: "Alt+T",
    points: 2,
    draw(ctx, d, g) {
      if (g.pts.length > 1) stroke(ctx, d, g.pts[0], g.pts[1]);
    },
    hit: (d, g, x, y) => nearPolyline(g.pts, x, y),
  },
  ray: {
    name: "Rayo",
    points: 2,
    draw(ctx, d, g) {
      if (g.pts.length < 2) return;
      const [a, b] = extend(g.pts[0], g.pts[1], g.width, false);
      stroke(ctx, d, a, b);
    },
    hit(d, g, x, y) {
      const [a, b] = extend(g.pts[0], g.pts[1], g.width, false);
      return distToSegment(x, y, a, b) <= HIT;
    },
  },
  extended: {
    name: "Línea extendida",
    shortcut: "Alt+E",
    points: 2,
    draw(ctx, d, g) {
      if (g.pts.length < 2) return;
      const [a, b] = extend(g.pts[0], g.pts[1], g.width, true);
      stroke(ctx, d, a, b);
    },
    hit(d, g, x, y) {
      const [a, b] = extend(g.pts[0], g.pts[1], g.width, true);
      return distToSegment(x, y, a, b) <= HIT;
    },
  },
  info: {
    name: "Línea de información",
    shortcut: "Alt+I",
    points: 2,
    draw(ctx, d, g, m) {
      if (g.pts.length < 2) return;
      const [a, b] = g.pts;
      stroke(ctx, d, a, b);
      const [p1, p2] = d.points;
      const bars = Math.round(m.logicalOf(p2.time) - m.logicalOf(p1.time));
      const angle = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI;
      tag(
        ctx,
        [changeLabel(m, p1.price, p2.price), `${bars} barras · ${durationLabel(p2.time - p1.time)}`, `${angle.toFixed(1)}°`],
        b.x,
        b.y + 14,
        { bg: m.colors.label, fg: m.colors.text, anchor: "top" },
      );
    },
    hit: (d, g, x, y) => nearPolyline(g.pts, x, y),
  },
  trendangle: {
    name: "Ángulo de tendencia",
    points: 2,
    draw(ctx, d, g) {
      if (g.pts.length < 2) return;
      const [a, b] = g.pts;
      stroke(ctx, d, a, b);
      stroke(ctx, d, a, { x: a.x + 60, y: a.y }, { dashed: true, width: 1 });
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.strokeStyle = d.style.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 34, Math.min(0, ang), Math.max(0, ang));
      ctx.stroke();
      ctx.restore();
      caption(ctx, `${((-ang * 180) / Math.PI).toFixed(1)}°`, a.x + 40, a.y + (ang < 0 ? -10 : 10), d.style.color);
    },
    hit: (d, g, x, y) => nearPolyline(g.pts, x, y),
  },
  hline: {
    name: "Línea horizontal",
    shortcut: "Alt+H",
    points: 1,
    draw(ctx, d, g) {
      stroke(ctx, d, { x: 0, y: g.pts[0].y }, { x: g.width, y: g.pts[0].y });
    },
    hit: (d, g, x, y) => Math.abs(y - g.pts[0].y) <= HIT,
    handles: (d, g) => [{ x: Math.min(Math.max(g.pts[0].x, 8), g.width - 8), y: g.pts[0].y }],
    priceAxis: (d) => [d.points[0].price],
  },
  hray: {
    name: "Rayo horizontal",
    shortcut: "Alt+J",
    points: 1,
    draw(ctx, d, g) {
      stroke(ctx, d, g.pts[0], { x: g.width, y: g.pts[0].y });
    },
    hit: (d, g, x, y) => x >= g.pts[0].x - HIT && Math.abs(y - g.pts[0].y) <= HIT,
    priceAxis: (d) => [d.points[0].price],
  },
  vline: {
    name: "Línea vertical",
    shortcut: "Alt+V",
    points: 1,
    draw(ctx, d, g) {
      stroke(ctx, d, { x: g.pts[0].x, y: 0 }, { x: g.pts[0].x, y: g.height });
    },
    hit: (d, g, x) => Math.abs(x - g.pts[0].x) <= HIT,
    timeAxis: (d) => [d.points[0].time],
  },
  crossline: {
    name: "Línea cruzada",
    shortcut: "Alt+C",
    points: 1,
    draw(ctx, d, g) {
      const a = g.pts[0];
      stroke(ctx, d, { x: 0, y: a.y }, { x: g.width, y: a.y });
      stroke(ctx, d, { x: a.x, y: 0 }, { x: a.x, y: g.height });
    },
    hit: (d, g, x, y) => Math.abs(x - g.pts[0].x) <= HIT || Math.abs(y - g.pts[0].y) <= HIT,
    priceAxis: (d) => [d.points[0].price],
    timeAxis: (d) => [d.points[0].time],
  },
  arrow: {
    name: "Flecha",
    points: 2,
    draw(ctx, d, g) {
      if (g.pts.length < 2) return;
      stroke(ctx, d, g.pts[0], g.pts[1]);
      arrowHead(ctx, g.pts[0], g.pts[1], d.style.color, 10 + d.style.width * 2);
    },
    hit: (d, g, x, y) => nearPolyline(g.pts, x, y),
  },

  // ── Channels ──
  channel: {
    name: "Canal paralelo",
    points: 3,
    draw(ctx, d, g) {
      const [a, b, c] = g.pts;
      if (!b) return;
      stroke(ctx, d, a, b);
      if (!c) return;
      // The third point sets a parallel of a→b through it.
      const off = channelOffset(a, b, c);
      const a2 = { x: a.x, y: a.y + off };
      const b2 = { x: b.x, y: b.y + off };
      polyline(ctx, d.style.color, 0, [a, b, b2, a2], { closed: true, fill: withAlpha(d.style.color, 0.1) });
      stroke(ctx, d, a2, b2);
      stroke(ctx, d, { x: a.x, y: a.y + off / 2 }, { x: b.x, y: b.y + off / 2 }, { dashed: true, width: 1 });
    },
    hit(d, g, x, y) {
      const [a, b, c] = g.pts;
      if (!c) return nearPolyline(g.pts, x, y);
      const off = channelOffset(a, b, c);
      return nearPolyline([a, b, { x: b.x, y: b.y + off }, { x: a.x, y: a.y + off }], x, y, true);
    },
  },
  regression: {
    name: "Canal de regresión",
    points: 2,
    draw(ctx, d, g, m) {
      const r = m.regression(d);
      if (!r) {
        if (g.pts.length > 1) stroke(ctx, d, g.pts[0], g.pts[1], { dashed: true, width: 1 });
        return;
      }
      const at = (i: number, dev: number) => ({ x: m.xOfLogical(i), y: m.yOfPrice(r.a + r.b * (i - r.i0) + dev) });
      const lines = [0, 2 * r.sigma, -2 * r.sigma].map((dev) => [at(r.i0, dev), at(r.i1, dev)]);
      if (lines.flat().some((p) => p.x === null || p.y === null)) return;
      const [mid, top, bot] = lines as Px[][];
      polyline(ctx, d.style.color, 0, [top[0], top[1], bot[1], bot[0]], { closed: true, fill: withAlpha(d.style.color, 0.08) });
      stroke(ctx, d, mid[0], mid[1], { dashed: true });
      stroke(ctx, d, top[0], top[1]);
      stroke(ctx, d, bot[0], bot[1]);
      caption(ctx, `r ${r.pearson.toFixed(2)} · ±2σ`, top[1].x + 6, top[1].y, d.style.color);
    },
    hit(d, g, x, y, m) {
      const r = m.regression(d);
      if (!r) return nearPolyline(g.pts, x, y);
      const x1 = m.xOfLogical(r.i0);
      const x2 = m.xOfLogical(r.i1);
      if (x1 === null || x2 === null) return false;
      if (x < Math.min(x1, x2) - HIT || x > Math.max(x1, x2) + HIT) return false;
      const i = r.i0 + ((x - x1) / Math.max(1e-6, x2 - x1)) * (r.i1 - r.i0);
      const mid = r.a + r.b * (i - r.i0);
      return [0, 2 * r.sigma, -2 * r.sigma].some((dev) => {
        const yy = m.yOfPrice(mid + dev);
        return yy !== null && Math.abs(yy - y) <= HIT;
      });
    },
  },
  pitchfork: {
    name: "Tridente (Andrews)",
    points: 3,
    draw(ctx, d, g) {
      const [a, b, c] = g.pts;
      if (!b) return;
      if (!c) {
        stroke(ctx, d, a, b);
        return;
      }
      const [[, midFar], [, bFar], [, cFar]] = pitchforkLines(g);
      polyline(ctx, d.style.color, 0, [b, bFar, cFar, c], { closed: true, fill: withAlpha(d.style.color, 0.08) });
      stroke(ctx, d, a, midFar);
      stroke(ctx, d, b, bFar);
      stroke(ctx, d, c, cFar);
      stroke(ctx, d, b, c, { dashed: true, width: 1 });
    },
    hit(d, g, x, y) {
      if (g.pts.length < 3) return nearPolyline(g.pts, x, y);
      return pitchforkLines(g).some(([p, q]) => distToSegment(x, y, p, q) <= HIT);
    },
  },

  // ── Fibonacci & Gann ──
  fib: {
    name: "Retroceso de Fibonacci",
    shortcut: "Alt+F",
    points: 2,
    draw(ctx, d, g, m) {
      if (g.pts.length < 2) return;
      const [a, b] = g.pts;
      const [p1, p2] = d.points;
      // TradingView's convention: level 1 at the first click, 0 at the second.
      const levels = FIB_RETRACEMENT.map((k, i) => {
        const price = p2.price + (p1.price - p2.price) * k;
        return { i, k, price, y: m.yOfPrice(price) };
      }).filter((n): n is { i: number; k: number; price: number; y: number } => n.y !== null);
      fibLevels(ctx, levels, Math.min(a.x, b.x), Math.max(a.x, b.x), m);
      stroke(ctx, d, a, b, { dashed: true, width: 1 });
    },
    hit(d, g, x, y, m) {
      if (nearPolyline(g.pts, x, y)) return true;
      const [a, b] = g.pts;
      if (x < Math.min(a.x, b.x) - HIT || x > Math.max(a.x, b.x) + HIT) return false;
      const [p1, p2] = d.points;
      return FIB_RETRACEMENT.some((k) => {
        const yy = m.yOfPrice(p2.price + (p1.price - p2.price) * k);
        return yy !== null && Math.abs(yy - y) <= HIT;
      });
    },
  },
  fibext: {
    name: "Extensión de Fibonacci por tendencia",
    points: 3,
    draw(ctx, d, g, m) {
      const [a, b, c] = g.pts;
      polyline(ctx, d.style.color, 1, g.pts);
      if (!c) return;
      const [p1, p2, p3] = d.points;
      const x2 = c.x + Math.max(Math.abs(b.x - a.x), 60);
      const levels = FIB_EXTENSION.map((k, i) => {
        const price = p3.price + (p2.price - p1.price) * k;
        return { i, k, price, y: m.yOfPrice(price) };
      }).filter((n): n is { i: number; k: number; price: number; y: number } => n.y !== null);
      fibLevels(ctx, levels, c.x, x2, m);
    },
    hit(d, g, x, y, m) {
      if (nearPolyline(g.pts, x, y)) return true;
      const [a, b, c] = g.pts;
      if (!c) return false;
      const x2 = c.x + Math.max(Math.abs(b.x - a.x), 60);
      if (x < c.x - HIT || x > x2 + HIT) return false;
      const [p1, p2, p3] = d.points;
      return FIB_EXTENSION.some((k) => {
        const yy = m.yOfPrice(p3.price + (p2.price - p1.price) * k);
        return yy !== null && Math.abs(yy - y) <= HIT;
      });
    },
  },
  fibtime: {
    name: "Zonas de tiempo de Fibonacci",
    points: 2,
    draw(ctx, d, g, m) {
      if (g.pts.length < 2) return;
      const l1 = m.logicalOf(d.points[0].time);
      const unit = m.logicalOf(d.points[1].time) - l1;
      if (Math.abs(unit) < 0.5) return;
      FIB_TIME.forEach((n, i) => {
        const x = m.xOfLogical(l1 + unit * n);
        if (x === null || x < -2 || x > g.width + 2) return;
        const color = m.colors.levels[i % m.colors.levels.length];
        stroke(ctx, d, { x, y: 0 }, { x, y: g.height }, { width: 1, color });
        caption(ctx, String(n), x + 4, g.height - 10, color);
      });
    },
    hit(d, g, x, y, m) {
      const l1 = m.logicalOf(d.points[0].time);
      const unit = m.logicalOf(d.points[1]?.time ?? d.points[0].time) - l1;
      return FIB_TIME.some((n) => Math.abs((m.xOfLogical(l1 + unit * n) ?? -1e9) - x) <= HIT);
    },
  },
  gannbox: {
    name: "Caja de Gann",
    points: 2,
    draw(ctx, d, g, m) {
      if (g.pts.length < 2) return;
      const [a, b] = g.pts;
      const r = boxOf(g.pts);
      ctx.fillStyle = withAlpha(d.style.color, 0.05);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      GANN.forEach((k, i) => {
        const color = m.colors.levels[i % m.colors.levels.length];
        const x = a.x + (b.x - a.x) * k;
        const y = a.y + (b.y - a.y) * k;
        stroke(ctx, d, { x, y: r.y }, { x, y: r.y + r.h }, { width: 1, color });
        stroke(ctx, d, { x: r.x, y }, { x: r.x + r.w, y }, { width: 1, color });
        caption(ctx, String(k), x, r.y - 8, color, { align: "center" });
        caption(ctx, String(k), r.x - 4, y, color, { align: "right" });
      });
      stroke(ctx, d, a, b, { dashed: true, width: 1 });
      stroke(ctx, d, { x: a.x, y: b.y }, { x: b.x, y: a.y }, { dashed: true, width: 1 });
    },
    hit: (d, g, x, y) => inBox(g.pts, x, y),
  },

  // ── Patterns ──
  xabcd: pattern(
    "Patrón XABCD",
    5,
    ["X", "A", "B", "C", "D"],
    // B retraces XA, C retraces AB, D extends BC, and D against XA
    [
      [0, 2, 1, 2, 0],
      [1, 3, 2, 3, 1],
      [2, 4, 3, 4, 2],
      [0, 4, 1, 4, 0],
    ],
    true,
  ),
  abcd: pattern("Patrón ABCD", 4, ["A", "B", "C", "D"], [
    [0, 2, 1, 2, 0],
    [1, 3, 2, 3, 1],
  ]),
  hs: {
    name: "Hombro-cabeza-hombro",
    points: 7,
    draw(ctx, d, g, m) {
      const p = g.pts;
      polyline(ctx, d.style.color, d.style.width, p);
      // Neckline through the two troughs (points 2 and 4), stretched both ways
      if (p[4]) {
        const [a, b] = extend(p[2], p[4], g.width, true);
        stroke(ctx, d, a, b, { dashed: true, width: 1 });
      }
      const names: Record<number, string> = { 1: "Hombro izq.", 3: "Cabeza", 5: "Hombro der." };
      for (const [k, text] of Object.entries(names)) {
        const i = Number(k);
        const q = p[i];
        if (!q) continue;
        const above = !p[i - 1] || q.y <= p[i - 1].y;
        tag(ctx, [text], q.x, q.y + (above ? -8 : 8), {
          bg: d.style.color,
          fg: m.colors.onColor,
          anchor: above ? "bottom" : "top",
          size: 11,
        });
      }
    },
    hit: (d, g, x, y) => nearPolyline(g.pts, x, y),
  },
  elliott: {
    name: "Onda de impulso de Elliott",
    points: 6,
    draw(ctx, d, g, m) {
      polyline(ctx, d.style.color, d.style.width, g.pts);
      vertexLetters(ctx, g.pts, ["", "(1)", "(2)", "(3)", "(4)", "(5)"], d, m);
    },
    hit: (d, g, x, y) => nearPolyline(g.pts, x, y),
  },
  elliottabc: {
    name: "Onda correctiva de Elliott (ABC)",
    points: 4,
    draw(ctx, d, g, m) {
      polyline(ctx, d.style.color, d.style.width, g.pts);
      vertexLetters(ctx, g.pts, ["", "(A)", "(B)", "(C)"], d, m);
    },
    hit: (d, g, x, y) => nearPolyline(g.pts, x, y),
  },

  // ── Forecasting & measuring ──
  long: position(true),
  short: position(false),
  range: {
    name: "Rango de fecha y precio",
    shortcut: "Alt+D",
    points: 2,
    draw(ctx, d, g, m) {
      if (g.pts.length < 2) return;
      const [a, b] = g.pts;
      const [p1, p2] = d.points;
      const up = p2.price >= p1.price;
      const color = up ? m.colors.up : m.colors.down;
      const r = boxOf(g.pts);
      ctx.fillStyle = withAlpha(color, 0.14);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      stroke(ctx, d, { x: a.x, y: cy }, { x: b.x, y: cy }, { width: 1, color });
      stroke(ctx, d, { x: cx, y: a.y }, { x: cx, y: b.y }, { width: 1, color });
      arrowHead(ctx, { x: cx, y: a.y }, { x: cx, y: b.y }, color);
      arrowHead(ctx, { x: a.x, y: cy }, { x: b.x, y: cy }, color);
      const [from, to] = m.barRange(p1.time, p2.time);
      tag(
        ctx,
        [
          changeLabel(m, p1.price, p2.price),
          `${to - from} barras, ${durationLabel(p2.time - p1.time)}`,
          `Vol ${volumeLabel(m.volumeBetween(from, to))}`,
        ],
        r.x + r.w / 2,
        up ? r.y - 6 : r.y + r.h + 6,
        { bg: color, fg: m.colors.onColor, anchor: up ? "bottom" : "top" },
      );
    },
    hit: (d, g, x, y) => inBox(g.pts, x, y),
  },
  daterange: {
    name: "Rango de fechas",
    points: 2,
    draw(ctx, d, g, m) {
      if (g.pts.length < 2) return;
      const [a, b] = g.pts;
      const r = boxOf(g.pts);
      const cy = r.y + r.h / 2;
      ctx.fillStyle = withAlpha(d.style.color, 0.12);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      stroke(ctx, d, { x: a.x, y: r.y }, { x: a.x, y: r.y + r.h }, { width: 1 });
      stroke(ctx, d, { x: b.x, y: r.y }, { x: b.x, y: r.y + r.h }, { width: 1 });
      stroke(ctx, d, { x: a.x, y: cy }, { x: b.x, y: cy }, { width: 1 });
      arrowHead(ctx, { x: a.x, y: cy }, { x: b.x, y: cy }, d.style.color);
      const [from, to] = m.barRange(d.points[0].time, d.points[1].time);
      tag(
        ctx,
        [
          `${to - from} barras, ${durationLabel(d.points[1].time - d.points[0].time)}`,
          `Vol ${volumeLabel(m.volumeBetween(from, to))}`,
        ],
        r.x + r.w / 2,
        r.y + r.h + 6,
        { bg: d.style.color, fg: m.colors.onColor, anchor: "top" },
      );
    },
    hit: (d, g, x, y) => inBox(g.pts, x, y),
  },
  pricerange: {
    name: "Rango de precio",
    points: 2,
    draw(ctx, d, g, m) {
      if (g.pts.length < 2) return;
      const [a, b] = g.pts;
      const r = boxOf(g.pts);
      const cx = r.x + r.w / 2;
      ctx.fillStyle = withAlpha(d.style.color, 0.12);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      stroke(ctx, d, { x: r.x, y: a.y }, { x: r.x + r.w, y: a.y }, { width: 1 });
      stroke(ctx, d, { x: r.x, y: b.y }, { x: r.x + r.w, y: b.y }, { width: 1 });
      stroke(ctx, d, { x: cx, y: a.y }, { x: cx, y: b.y }, { width: 1 });
      arrowHead(ctx, { x: cx, y: a.y }, { x: cx, y: b.y }, d.style.color);
      const upward = b.y < a.y;
      tag(ctx, [changeLabel(m, d.points[0].price, d.points[1].price)], cx, b.y + (upward ? -6 : 6), {
        bg: d.style.color,
        fg: m.colors.onColor,
        anchor: upward ? "bottom" : "top",
      });
    },
    hit: (d, g, x, y) => inBox(g.pts, x, y),
  },
  avwap: {
    name: "VWAP anclado",
    shortcut: "Alt+A",
    points: 1,
    draw(ctx, d, g, m) {
      const line = m.anchoredVwap(d);
      if (line.length) {
        ctx.strokeStyle = d.style.color;
        ctx.lineWidth = d.style.width;
        ctx.beginPath();
        let started = false;
        for (const p of line) {
          const x = m.xOfLogical(p.l);
          const y = m.yOfPrice(p.v);
          if (x === null || y === null) continue;
          if (started) ctx.lineTo(x, y);
          else {
            ctx.moveTo(x, y);
            started = true;
          }
        }
        ctx.stroke();
      }
      // Anchor marker under the chosen candle
      const a = g.pts[0];
      ctx.fillStyle = d.style.color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + 4);
      ctx.lineTo(a.x - 5, a.y + 12);
      ctx.lineTo(a.x + 5, a.y + 12);
      ctx.closePath();
      ctx.fill();
    },
    hit(d, g, x, y, m) {
      if (Math.hypot(x - g.pts[0].x, y - g.pts[0].y) <= 10) return true;
      const line = m.anchoredVwap(d);
      for (let i = 1; i < line.length; i++) {
        const x1 = m.xOfLogical(line[i - 1].l);
        const x2 = m.xOfLogical(line[i].l);
        if (x1 === null || x2 === null || x < Math.min(x1, x2) - HIT || x > Math.max(x1, x2) + HIT) continue;
        const y1 = m.yOfPrice(line[i - 1].v);
        const y2 = m.yOfPrice(line[i].v);
        if (y1 !== null && y2 !== null && distToSegment(x, y, { x: x1, y: y1 }, { x: x2, y: y2 }) <= HIT) return true;
      }
      return false;
    },
    priceAxis(d, m) {
      const line = m.anchoredVwap(d);
      return line.length ? [line[line.length - 1].v] : [];
    },
  },
  frvp: {
    name: "Perfil de volumen de rango fijo",
    points: 2,
    draw(ctx, d, g, m) {
      if (g.pts.length < 2) return;
      const prof = m.profile(d);
      if (!prof || !prof.rows.length) return;
      const x0 = Math.min(g.pts[0].x, g.pts[1].x);
      const x1 = Math.max(g.pts[0].x, g.pts[1].x);
      const span = Math.max(1, x1 - x0);
      const yTop = m.yOfPrice(prof.max);
      const yBot = m.yOfPrice(prof.min);
      if (yTop === null || yBot === null) return;
      ctx.fillStyle = withAlpha(d.style.color, 0.06);
      ctx.fillRect(x0, Math.min(yTop, yBot), span, Math.abs(yBot - yTop));
      // Bars grow from the left edge, up-volume then down-volume, up to 30% wide
      const maxBar = span * 0.3;
      const maxVol = Math.max(...prof.rows.map((r) => r.total), 1e-12);
      for (const row of prof.rows) {
        if (!(row.total > 0)) continue;
        const yA = m.yOfPrice(row.high);
        const yB = m.yOfPrice(row.low);
        if (yA === null || yB === null) continue;
        const h = Math.max(0.7, Math.abs(yB - yA) - 0.4);
        const y = Math.min(yA, yB) + (Math.abs(yB - yA) - h) / 2;
        const w = (row.total / maxVol) * maxBar;
        const upW = (row.up / row.total) * w;
        if (upW > 0.25) {
          ctx.fillStyle = withAlpha(m.colors.up, row.inValueArea ? 0.55 : 0.16);
          ctx.fillRect(x0, y, upW, h);
        }
        if (w - upW > 0.25) {
          ctx.fillStyle = withAlpha(m.colors.down, row.inValueArea ? 0.42 : 0.14);
          ctx.fillRect(x0 + upW, y, w - upW, h);
        }
      }
      const yPoc = m.yOfPrice(prof.poc);
      if (yPoc !== null) stroke(ctx, d, { x: x0, y: yPoc }, { x: x1, y: yPoc }, { width: 1 });
      for (const price of [prof.vah, prof.val]) {
        const y = m.yOfPrice(price);
        if (y !== null) stroke(ctx, d, { x: x0, y }, { x: x1, y }, { width: 1, dashed: true });
      }
    },
    hit(d, g, x, y, m) {
      const prof = m.profile(d);
      if (!prof || !prof.rows.length || g.pts.length < 2) return false;
      const x0 = Math.min(g.pts[0].x, g.pts[1].x);
      const x1 = Math.max(g.pts[0].x, g.pts[1].x);
      const yTop = m.yOfPrice(prof.max);
      const yBot = m.yOfPrice(prof.min);
      if (yTop === null || yBot === null) return false;
      return x >= x0 - HIT && x <= x1 + HIT && y >= Math.min(yTop, yBot) - HIT && y <= Math.max(yTop, yBot) + HIT;
    },
    handles: (d, g) => g.pts.slice(0, 2),
    // Only the time edges matter: the price range comes from the candles
    moveHandle(d, i, p) {
      d.points[i] = { time: p.time, price: d.points[i].price };
    },
    priceAxis(d, m) {
      if (d.id !== m.selectedId) return [];
      const prof = m.profile(d);
      return prof ? [prof.poc, prof.vah, prof.val] : [];
    },
  },

  // ── Shapes ──
  brush: {
    name: "Pincel",
    points: "free",
    draw(ctx, d, g) {
      smoothStroke(ctx, g.pts, d.style.color, d.style.width);
    },
    hit: (d, g, x, y) => nearPolyline(g.pts, x, y),
    // A label per sample would bury the axes
    priceAxis: () => [],
    timeAxis: () => [],
  },
  rect: {
    name: "Rectángulo",
    shortcut: "Alt+Shift+R",
    points: 2,
    draw(ctx, d, g) {
      if (g.pts.length < 2) return;
      const r = boxOf(g.pts);
      ctx.fillStyle = withAlpha(d.style.color, 0.16);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = d.style.color;
      ctx.lineWidth = d.style.width;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    },
    hit: (d, g, x, y) => inBox(g.pts, x, y),
    handles(d, g) {
      const [a, b] = g.pts;
      return b ? [a, b, { x: a.x, y: b.y }, { x: b.x, y: a.y }] : [a];
    },
    // The crossed corners mix one point's time with the other's price
    moveHandle(d, i, p) {
      const [a, b] = d.points;
      if (i === 2) {
        a.time = p.time;
        b.price = p.price;
      } else if (i === 3) {
        b.time = p.time;
        a.price = p.price;
      } else d.points[i] = { ...p };
    },
  },
  circle: {
    name: "Círculo",
    points: 2,
    draw(ctx, d, g) {
      if (g.pts.length < 2) return;
      const [a, b] = g.pts;
      ctx.beginPath();
      ctx.arc(a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y), 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(d.style.color, 0.14);
      ctx.fill();
      ctx.strokeStyle = d.style.color;
      ctx.lineWidth = d.style.width;
      ctx.stroke();
    },
    hit(d, g, x, y) {
      const [a, b] = g.pts;
      return !!b && Math.hypot(x - a.x, y - a.y) <= Math.hypot(b.x - a.x, b.y - a.y) + HIT;
    },
  },

  // ── Annotations ──
  text: {
    name: "Texto",
    points: 1,
    editable: true,
    onCreate(d, m) {
      d.text = "Texto";
      m.editText(d);
    },
    draw(ctx, d, g) {
      const a = g.pts[0];
      const size = 12 + d.style.width * 2;
      ctx.save();
      ctx.font = `${size}px ${FONT}`;
      ctx.fillStyle = d.style.color;
      ctx.textBaseline = "top";
      const lines = String(d.text || "Texto").split("\n");
      const lineH = size + 4;
      let w = 0;
      lines.forEach((l, i) => {
        ctx.fillText(l, a.x, a.y + i * lineH);
        w = Math.max(w, ctx.measureText(l).width);
      });
      ctx.restore();
      boundsCache.set(d, { x: a.x - 3, y: a.y - 3, w: w + 6, h: lines.length * lineH + 6 });
    },
    hit: (d, g, x, y) => inRect(boundsCache.get(d), x, y),
  },
  pricelabel: {
    name: "Etiqueta de precio",
    shortcut: "Alt+L",
    points: 1,
    draw(ctx, d, g, m) {
      const a = g.pts[0];
      ctx.fillStyle = d.style.color;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
      ctx.fill();
      stroke(ctx, d, a, { x: a.x + 10, y: a.y - 14 }, { width: 1 });
      boundsCache.set(
        d,
        tag(ctx, [m.formatPrice(d.points[0].price)], a.x + 10, a.y - 14, {
          bg: d.style.color,
          fg: m.colors.onColor,
          align: "left",
          anchor: "bottom",
        }),
      );
    },
    hit: (d, g, x, y) => inRect(boundsCache.get(d), x, y) || Math.hypot(x - g.pts[0].x, y - g.pts[0].y) <= 8,
  },
  flag: {
    name: "Bandera",
    points: 1,
    draw(ctx, d, g) {
      const a = g.pts[0];
      stroke(ctx, d, a, { x: a.x, y: a.y - 28 }, { width: 2 });
      ctx.fillStyle = d.style.color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 28);
      ctx.lineTo(a.x + 18, a.y - 28);
      ctx.lineTo(a.x + 13, a.y - 22);
      ctx.lineTo(a.x + 18, a.y - 16);
      ctx.lineTo(a.x, a.y - 16);
      ctx.closePath();
      ctx.fill();
      boundsCache.set(d, { x: a.x - 4, y: a.y - 30, w: 24, h: 32 });
    },
    hit: (d, g, x, y) => inRect(boundsCache.get(d), x, y),
  },
  arrowup: arrowMark(true),
  arrowdown: arrowMark(false),
} satisfies Record<string, ToolDef>;

export type ToolId = keyof typeof TOOLS;

export const toolDef = (id: ToolId): ToolDef => TOOLS[id];

export const isToolId = (id: unknown): id is ToolId =>
  typeof id === "string" && Object.prototype.hasOwnProperty.call(TOOLS, id);

/** Rail groups, like TradingView's drop-downs. */
export const TOOL_GROUPS: { id: string; name: string; tools: ToolId[] }[] = [
  { id: "lines", name: "Líneas", tools: ["trend", "ray", "extended", "info", "trendangle", "hline", "hray", "vline", "crossline", "arrow"] },
  { id: "channels", name: "Canales", tools: ["channel", "regression", "pitchfork"] },
  { id: "fib", name: "Fibonacci y Gann", tools: ["fib", "fibext", "fibtime", "gannbox"] },
  { id: "patterns", name: "Patrones", tools: ["xabcd", "abcd", "hs", "elliott", "elliottabc"] },
  { id: "measure", name: "Predicción y medición", tools: ["long", "short", "range", "daterange", "pricerange", "avwap", "frvp"] },
  { id: "shapes", name: "Formas", tools: ["brush", "rect", "circle"] },
  { id: "notes", name: "Anotaciones", tools: ["text", "pricelabel", "flag", "arrowup", "arrowdown"] },
];

/* ---- candle math the tools rely on --------------------------------------- */

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Fixed-range volume profile: 24 rows, 70% value area. */
export function volumeProfile(bars: Bar[], t0: number, t1: number, rowsN = 24, valueArea = 70): VolumeProfile | null {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const slice = bars.filter((c) => c.time >= lo && c.time <= hi);
  if (!slice.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const c of slice) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  if (!(max > min)) max = min + 1e-8;
  const step = (max - min) / rowsN;
  const up = new Array<number>(rowsN).fill(0);
  const down = new Array<number>(rowsN).fill(0);
  // Each candle's volume is spread evenly over the rows its range covers
  for (const c of slice) {
    const a = Math.max(0, Math.floor((c.low - min) / step));
    const b = Math.min(rowsN - 1, Math.floor((c.high - min) / step));
    const share = Math.max(0, c.volume || 0) / Math.max(1, b - a + 1);
    for (let r = a; r <= b; r++) {
      if (c.close >= c.open) up[r] += share;
      else down[r] += share;
    }
  }
  const totals = up.map((u, i) => u + down[i]);
  let poc = 0;
  let total = 0;
  totals.forEach((t, i) => {
    total += t;
    if (t > totals[poc]) poc = i;
  });
  // Grow the value area from the POC toward the heavier neighbour
  const target = total * (valueArea / 100);
  let covered = totals[poc];
  let a = poc;
  let b = poc;
  while (covered < target && (a > 0 || b < rowsN - 1)) {
    const below = a > 0 ? totals[a - 1] : -1;
    const above = b < rowsN - 1 ? totals[b + 1] : -1;
    if (above >= below) covered += totals[++b];
    else covered += totals[--a];
  }
  const rows = totals.map((t, i) => ({
    low: min + i * step,
    high: min + (i + 1) * step,
    up: up[i],
    down: down[i],
    total: t,
    inValueArea: i >= a && i <= b,
  }));
  return {
    rows,
    poc: (rows[poc].low + rows[poc].high) / 2,
    vah: rows[b].high,
    val: rows[a].low,
    min,
    max,
  };
}

/** Least-squares fit of closes between two bar indexes, with σ and Pearson r. */
export function regressionOf(bars: Bar[], from: number, to: number): Regression | null {
  const i0 = Math.max(0, from);
  const i1 = Math.min(bars.length - 1, to);
  const n = i1 - i0 + 1;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = i0; i <= i1; i++) {
    const x = i - i0;
    const y = bars[i].close;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  let res = 0;
  for (let i = i0; i <= i1; i++) res += (bars[i].close - (a + b * (i - i0))) ** 2;
  const pearson = (n * sxy - sx * sy) / (Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy)) || 1);
  return { i0, i1, a, b, sigma: Math.sqrt(res / n), pearson };
}

/** Freehand clean-up: Ramer–Douglas–Peucker in pixels, keeping the ends. */
export function simplifyStroke<T extends Px>(pts: T[], tolerance = 1): T[] {
  if (pts.length < 3) return pts.slice();
  const run = (list: T[]): T[] => {
    if (list.length < 3) return list;
    const a = list[0];
    const b = list[list.length - 1];
    let max = 0;
    let idx = 0;
    for (let i = 1; i < list.length - 1; i++) {
      const dd = distToSegment(list[i].x, list[i].y, a, b);
      if (dd > max) {
        max = dd;
        idx = i;
      }
    }
    if (max <= tolerance) return [a, b];
    return run(list.slice(0, idx + 1)).slice(0, -1).concat(run(list.slice(idx)));
  };
  return run(pts);
}
