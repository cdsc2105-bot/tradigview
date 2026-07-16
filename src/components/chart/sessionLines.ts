import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/** A dashed vertical marker at one instant, labelled at the top of the pane. */
export interface SessionLine {
  time: UTCTimestamp;
  label: string;
  color: string;
}

/**
 * Dashed vertical lines marking the session open and the bars either side of it.
 *
 * lightweight-charts has no vertical-line series, so this rides on the candle
 * series' pane and paints straight onto the canvas, under the candles.
 */
export class SessionLinesPrimitive implements ISeriesPrimitive<Time> {
  private _lines: SessionLine[] = [];
  private _visible = false;
  private _chart: IChartApi | null = null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneView: SessionLinesPaneView;

  constructor() {
    this._paneView = new SessionLinesPaneView(this);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart as IChartApi;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  setLines(lines: SessionLine[], visible: boolean): void {
    this._lines = lines;
    this._visible = visible;
    this._requestUpdate?.();
  }

  /** Screen x of each line; lines scrolled out of view resolve to null and are dropped. */
  linePoints(): { x: number; label: string; color: string }[] | null {
    if (!this._visible || !this._chart || this._lines.length === 0) return null;
    const timeScale = this._chart.timeScale();
    const out: { x: number; label: string; color: string }[] = [];
    for (const line of this._lines) {
      const x = timeScale.timeToCoordinate(line.time);
      if (x === null) continue;
      out.push({ x, label: line.label, color: line.color });
    }
    return out.length > 0 ? out : null;
  }
}

class SessionLinesPaneView implements IPrimitivePaneView {
  constructor(private readonly _source: SessionLinesPrimitive) {}

  zOrder(): PrimitivePaneViewZOrder {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer | null {
    const lines = this._source.linePoints();
    if (!lines) return null;
    return new SessionLinesRenderer(lines);
  }
}

class SessionLinesRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly _lines: { x: number; label: string; color: string }[],
  ) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const height = scope.mediaSize.height;

      for (const { x, label, color } of this._lines) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(label, x, 6);
        ctx.restore();
      }
    });
  }
}

/** 90 → "1h30", 60 → "1h", 45 → "45m" — used for both the line labels and the pill. */
export function offsetLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/** Seconds that `tz` is ahead of UTC at the given instant (negative for New York). */
function tzOffsetSeconds(tsSec: number, tz: string): number {
  const date = new Date(tsSec * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const f: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") f[p.type] = Number(p.value);

  const asUtc = Date.UTC(
    f.year,
    f.month - 1,
    f.day,
    f.hour % 24,
    f.minute,
    f.second,
  );
  return Math.round((asUtc - date.getTime()) / 1000);
}

const NY_TZ = "America/New_York";
/** New York cash open: 09:30 local — the "OPEN" everyone trades around. */
const OPEN_HOUR = 9;
const OPEN_MINUTE = 30;
/** Enough days to cover a deep intraday history without drawing thousands of lines. */
const MAX_DAYS = 250;

/**
 * The New York open for every day the candles span, plus the flanking markers.
 *
 * Only meaningful intraday — on a daily chart or above the lines would land on
 * (or between) whole bars, so callers get an empty list back.
 */
export function sessionLines(
  candles: { time: number }[],
  offsetMinutes: number,
  colors: { open: string; flank: string },
): SessionLine[] {
  if (candles.length < 2) return [];

  const barSeconds = candles[1].time - candles[0].time;
  if (barSeconds <= 0 || barSeconds >= 86_400) return [];

  const first = candles[0].time;
  const last = candles[candles.length - 1].time;
  const offset = offsetMinutes * 60;

  const out: SessionLine[] = [];
  const startDay = Math.max(
    Math.floor(first / 86_400),
    Math.floor(last / 86_400) - MAX_DAYS,
  );
  const endDay = Math.floor(last / 86_400);

  for (let day = startDay; day <= endDay; day++) {
    const midnightUtc = day * 86_400;
    // The UTC instant of the NY open depends on whether that day is in DST, so
    // read the zone's real offset around the open rather than assuming −5h.
    const nyOffset = tzOffsetSeconds(midnightUtc + 13 * 3600, NY_TZ);
    const open = midnightUtc + OPEN_HOUR * 3600 + OPEN_MINUTE * 60 - nyOffset;

    const span = offsetLabel(offsetMinutes);

    const marks: SessionLine[] = [
      { time: (open - offset) as UTCTimestamp, label: `-${span}`, color: colors.flank },
      { time: open as UTCTimestamp, label: "OPEN", color: colors.open },
      { time: (open + offset) as UTCTimestamp, label: `+${span}`, color: colors.flank },
    ];

    for (const mark of marks) {
      if (mark.time < first || mark.time > last + barSeconds * 30) continue;
      // Snap to the bar that contains the instant — the line has to sit on a real
      // bar's timestamp or timeToCoordinate() can't place it.
      const snapped = Math.floor(mark.time / barSeconds) * barSeconds;
      out.push({ ...mark, time: snapped as UTCTimestamp });
    }
  }

  return out;
}
