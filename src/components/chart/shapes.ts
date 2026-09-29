import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { ShapeKind } from "@/lib/store/chart-store";

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/** A drawing in chart space (unix-second time, price). */
export interface ShapeView {
  kind: ShapeKind;
  t1: number;
  p1: number;
  t2: number;
  p2: number;
  text?: string;
  /** The one being placed — drawn dashed */
  draft?: boolean;
  /** Own color / line width (defaults: app blue, 2px lines) */
  color?: string;
  width?: number;
  /** Selected in the chart — shows its handles */
  selected?: boolean;
}

/** Converts chart space to pane pixels; null when it can't be placed. */
export type Projector = (time: number, price: number) => { x: number; y: number } | null;

export const SHAPE_COLOR = "#2962ff";

/** Fibonacci retracement levels and their colors, 1 at the first click. */
export const FIB_LEVELS: { level: number; color: string }[] = [
  { level: 0, color: "#787b86" },
  { level: 0.236, color: "#f23645" },
  { level: 0.382, color: "#ff9800" },
  { level: 0.5, color: "#4caf50" },
  { level: 0.618, color: "#089981" },
  { level: 0.786, color: "#00bcd4" },
  { level: 1, color: "#787b86" },
];

/** Price of a Fibonacci level between the two anchors (1 = first click). */
export const fibPrice = (s: Pick<ShapeView, "p1" | "p2">, level: number) =>
  s.p2 + (s.p1 - s.p2) * level;

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * Paints the user's drawings (trend lines, rays, Fibonacci, rectangles, text)
 * on the price pane. Projection is supplied by the chart so drawings follow
 * the data across timeframes and can sit past the last bar.
 */
export class ShapesPrimitive implements ISeriesPrimitive<Time> {
  private _shapes: ShapeView[] = [];
  private _visible = true;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneView: ShapesPaneView;

  constructor(
    readonly project: Projector,
    readonly formatPrice: (p: number) => string,
  ) {
    this._paneView = new ShapesPaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  setShapes(shapes: ShapeView[], visible: boolean): void {
    this._shapes = shapes;
    this._visible = visible;
    this._requestUpdate?.();
  }

  get shapes(): ShapeView[] {
    return this._visible ? this._shapes : [];
  }
}

class ShapesPaneView implements IPrimitivePaneView {
  constructor(private readonly _source: ShapesPrimitive) {}

  zOrder(): PrimitivePaneViewZOrder {
    return "top";
  }

  renderer(): IPrimitivePaneRenderer | null {
    return this._source.shapes.length > 0 ? new ShapesRenderer(this._source) : null;
  }
}

class ShapesRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly _src: ShapesPrimitive) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const width = scope.mediaSize.width;
      for (const s of this._src.shapes) {
        const a = this._src.project(s.t1, s.p1);
        const b = this._src.project(s.t2, s.p2);
        if (!a || !b) continue;
        const color = s.color ?? SHAPE_COLOR;
        const width = s.width ?? 2;
        ctx.save();
        ctx.setLineDash(s.draft ? [5, 4] : []);
        ctx.font = "11px Inter, system-ui, sans-serif";
        switch (s.kind) {
          case "trend":
          case "ray": {
            let { x: x2, y: y2 } = b;
            if (s.kind === "ray" && b.x !== a.x) {
              // Extend through the second point to the right edge
              const k = (b.y - a.y) / (b.x - a.x);
              x2 = b.x > a.x ? width : 0;
              y2 = a.y + k * (x2 - a.x);
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            break;
          }
          case "rect": {
            const x = Math.min(a.x, b.x);
            const y = Math.min(a.y, b.y);
            const w = Math.abs(b.x - a.x);
            const h = Math.abs(b.y - a.y);
            ctx.fillStyle = alpha(color, 0.14);
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = color;
            ctx.lineWidth = s.width ?? 1;
            ctx.strokeRect(x, y, w, h);
            break;
          }
          case "fib": {
            const left = Math.min(a.x, b.x);
            const right = Math.max(a.x, b.x);
            let prevY: number | null = null;
            for (const { level, color } of FIB_LEVELS) {
              const price = fibPrice(s, level);
              const pt = this._src.project(s.t1, price);
              if (!pt) continue;
              if (prevY !== null) {
                ctx.fillStyle = alpha(color, 0.08);
                ctx.fillRect(left, Math.min(prevY, pt.y), right - left, Math.abs(pt.y - prevY));
              }
              prevY = pt.y;
              ctx.strokeStyle = color;
              ctx.lineWidth = s.width ?? 1;
              ctx.beginPath();
              ctx.moveTo(left, pt.y);
              ctx.lineTo(right, pt.y);
              ctx.stroke();
              ctx.fillStyle = color;
              ctx.textAlign = "right";
              ctx.textBaseline = "middle";
              ctx.fillText(`${level} (${this._src.formatPrice(price)})`, left - 4, pt.y);
            }
            // The diagonal between the anchors, as TradingView shows it
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = alpha("#787b86", 0.7);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            break;
          }
          case "text": {
            const label = s.text || "Texto";
            ctx.font = "13px Inter, system-ui, sans-serif";
            const w = ctx.measureText(label).width + 12;
            ctx.fillStyle = "rgba(19,24,35,0.9)";
            ctx.strokeStyle = color;
            ctx.lineWidth = s.selected ? 2 : 1;
            ctx.beginPath();
            ctx.roundRect(a.x, a.y - 11, w, 22, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#e2e6ee";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(label, a.x + 6, a.y);
            break;
          }
        }
        ctx.restore();

        // Handles on the selected drawing's anchor points
        if (s.selected && s.kind !== "text") {
          ctx.save();
          ctx.setLineDash([]);
          for (const p of [a, b]) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = "#070b14";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = color;
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    });
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Pixel width of a text note's box, for hit-testing (matches the renderer). */
export function textBoxWidth(text: string | undefined): number {
  if (typeof document === "undefined") return 60;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 60;
  measureCtx.font = "13px Inter, system-ui, sans-serif";
  return measureCtx.measureText(text || "Texto").width + 12;
}
