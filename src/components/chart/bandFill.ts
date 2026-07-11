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

/** One vertical slice of a filled region: its top and bottom price at a time. */
export interface FillBand {
  time: UTCTimestamp;
  top: number;
  bottom: number;
}

/** A shaded region defined by a top and bottom polyline, drawn in one color. */
export interface FillRegion {
  bands: FillBand[];
  color: string;
}

interface Point {
  x: number;
  yTop: number;
  yBottom: number;
}

/**
 * Shades one or more regions between two price polylines each.
 *
 * lightweight-charts has no built-in "fill between two lines" series, so this
 * attaches to the candlestick series (sharing its price scale) and paints the
 * regions underneath everything else. Used by both the EMA ribbon (one region)
 * and the VWAP deviation bands (several stacked regions).
 */
export class BandFillPrimitive implements ISeriesPrimitive<Time> {
  private _regions: FillRegion[] = [];
  private _visible = false;
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<"Candlestick"> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneView: BandFillPaneView;

  constructor() {
    this._paneView = new BandFillPaneView(this);
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

  setRegions(regions: FillRegion[], visible: boolean): void {
    this._regions = regions;
    this._visible = visible;
    this._requestUpdate?.();
  }

  /** Convert every region's bands to screen coordinates; null when nothing to draw. */
  regionPoints(): { points: Point[]; color: string }[] | null {
    if (!this._visible || !this._chart || !this._series) return null;
    if (this._regions.length === 0) return null;

    const timeScale = this._chart.timeScale();
    const series = this._series;
    const out: { points: Point[]; color: string }[] = [];

    for (const region of this._regions) {
      if (region.bands.length < 2) continue;
      const points: Point[] = [];
      for (const band of region.bands) {
        const x = timeScale.timeToCoordinate(band.time);
        const yTop = series.priceToCoordinate(band.top);
        const yBottom = series.priceToCoordinate(band.bottom);
        if (x === null || yTop === null || yBottom === null) continue;
        points.push({ x, yTop, yBottom });
      }
      if (points.length >= 2) out.push({ points, color: region.color });
    }

    return out.length > 0 ? out : null;
  }
}

class BandFillPaneView implements IPrimitivePaneView {
  constructor(private readonly _source: BandFillPrimitive) {}

  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const regions = this._source.regionPoints();
    if (!regions) return null;
    return new BandFillRenderer(regions);
  }
}

class BandFillRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly _regions: { points: Point[]; color: string }[]) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      for (const { points: pts, color } of this._regions) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].yTop);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].yTop);
        for (let i = pts.length - 1; i >= 0; i--)
          ctx.lineTo(pts[i].x, pts[i].yBottom);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      }
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
