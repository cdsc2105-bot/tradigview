import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/** A straight line between two points of the host series' value space. */
export interface Segment {
  t1: UTCTimestamp;
  v1: number;
  t2: UTCTimestamp;
  v2: number;
  color: string;
  /** Hidden divergences are drawn dashed, like most TV divergence scripts */
  dashed?: boolean;
}

interface SegmentPx {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  dashed: boolean;
}

/**
 * Draws line segments on whatever pane the host series lives in — used for the
 * red/green divergence trend lines over the RSI, the way CdeCripto's chart
 * connects one pivot to the next.
 */
export class SegmentsPrimitive implements ISeriesPrimitive<Time> {
  private _segments: Segment[] = [];
  private _visible = false;
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneView: SegmentsPaneView;

  constructor() {
    this._paneView = new SegmentsPaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart as IChartApi;
    this._series = param.series as ISeriesApi<SeriesType>;
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

  setSegments(segments: Segment[], visible: boolean): void {
    this._segments = segments;
    this._visible = visible;
    this._requestUpdate?.();
  }

  /** Both endpoints in pixels; segments scrolled fully out of view are dropped. */
  segmentPoints(): SegmentPx[] | null {
    if (!this._visible || !this._chart || !this._series) return null;
    if (this._segments.length === 0) return null;

    const ts = this._chart.timeScale();
    const out: SegmentPx[] = [];
    for (const s of this._segments) {
      const x1 = ts.timeToCoordinate(s.t1);
      const x2 = ts.timeToCoordinate(s.t2);
      const y1 = this._series.priceToCoordinate(s.v1);
      const y2 = this._series.priceToCoordinate(s.v2);
      if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
      out.push({ x1, y1, x2, y2, color: s.color, dashed: s.dashed ?? false });
    }
    return out.length > 0 ? out : null;
  }
}

class SegmentsPaneView implements IPrimitivePaneView {
  constructor(private readonly _source: SegmentsPrimitive) {}

  zOrder(): PrimitivePaneViewZOrder {
    return "top"; // over the RSI line, like a drawn trend line
  }

  renderer(): IPrimitivePaneRenderer | null {
    const segments = this._source.segmentPoints();
    if (!segments) return null;
    return new SegmentsRenderer(segments);
  }
}

class SegmentsRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly _segments: SegmentPx[]) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      for (const s of this._segments) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash(s.dashed ? [4, 3] : []);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }
}
