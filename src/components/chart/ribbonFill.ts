import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

/** Canvas target type, derived from the library so we don't import fancy-canvas directly. */
type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/** One vertical slice of the ribbon: the fastest and slowest EMA at a given time. */
export interface RibbonBand {
  time: UTCTimestamp;
  top: number;
  bottom: number;
}

interface Point {
  x: number;
  yTop: number;
  yBottom: number;
}

/**
 * Shades the area between the fastest and slowest EMA of the ribbon.
 *
 * lightweight-charts has no built-in "fill between two lines" series, so this
 * attaches to the candlestick series (sharing its price scale) and paints the
 * band underneath everything else.
 */
export class RibbonFillPrimitive implements ISeriesPrimitive<Time> {
  private _bands: RibbonBand[] = [];
  private _color = "rgba(41, 98, 255, 0.10)";
  private _visible = false;
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<"Candlestick"> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneView: RibbonFillPaneView;

  constructor() {
    this._paneView = new RibbonFillPaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart as IChartApi;
    this._series = param.series as ISeriesApi<"Candlestick">;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  setData(bands: RibbonBand[], color: string, visible: boolean): void {
    this._bands = bands;
    this._color = color;
    this._visible = visible;
    this._requestUpdate?.();
  }

  /** Convert bands to screen coordinates; returns null when the chart isn't ready. */
  points(): Point[] | null {
    if (!this._visible || !this._chart || !this._series) return null;
    if (this._bands.length < 2) return null;

    const timeScale = this._chart.timeScale();
    const series = this._series;
    const points: Point[] = [];

    for (const band of this._bands) {
      const x = timeScale.timeToCoordinate(band.time);
      const yTop = series.priceToCoordinate(band.top);
      const yBottom = series.priceToCoordinate(band.bottom);
      if (x === null || yTop === null || yBottom === null) continue;
      points.push({ x, yTop, yBottom });
    }

    return points.length >= 2 ? points : null;
  }

  color(): string {
    return this._color;
  }
}

class RibbonFillPaneView implements IPrimitivePaneView {
  constructor(private readonly _source: RibbonFillPrimitive) {}

  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const points = this._source.points();
    if (!points) return null;
    return new RibbonFillRenderer(points, this._source.color());
  }
}

class RibbonFillRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly _points: Point[],
    private readonly _color: string,
  ) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const pts = this._points;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].yTop);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].yTop);
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].yBottom);
      ctx.closePath();
      ctx.fillStyle = this._color;
      ctx.fill();
      ctx.restore();
    });
  }
}

/** Turn a hex color and 0–100 opacity into an rgba() string. */
export function hexToRgba(hex: string, opacityPct: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const a = Math.max(0, Math.min(100, opacityPct)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
