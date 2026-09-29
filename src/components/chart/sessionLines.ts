import type {
  IChartApi,
  Logical,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/** A vertical marker at one instant, labelled at the top of the pane. */
export interface SessionLine {
  time: UTCTimestamp;
  label: string;
  color: string;
  /** Flanking and pre-close markers are dashed; open and close are solid */
  dashed: boolean;
  /** Label line, so several markets' labels stack instead of overlapping */
  row: number;
}

/**
 * Where the last bar sits, so marks still in the future (today's close) can
 * be placed in the empty space right of the chart.
 */
export interface SessionAnchor {
  lastTime: number;
  lastLogical: number;
  barSeconds: number;
}

/**
 * Dashed vertical lines marking the session open and the bars either side of it.
 *
 * lightweight-charts has no vertical-line series, so this rides on the candle
 * series' pane and paints straight onto the canvas, under the candles.
 */
export class SessionLinesPrimitive implements ISeriesPrimitive<Time> {
  private _lines: SessionLine[] = [];
  private _anchor: SessionAnchor | null = null;
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

  setLines(lines: SessionLine[], visible: boolean, anchor: SessionAnchor | null = null): void {
    this._lines = lines;
    this._anchor = anchor;
    this._visible = visible;
    this._requestUpdate?.();
  }

  /** Screen x of each line; lines scrolled out of view resolve to null and are dropped. */
  linePoints(): LinePoint[] | null {
    if (!this._visible || !this._chart || this._lines.length === 0) return null;
    const timeScale = this._chart.timeScale();
    const out: LinePoint[] = [];
    const a = this._anchor;
    for (const line of this._lines) {
      let x = timeScale.timeToCoordinate(line.time);
      // Past the last bar there's no bar to hang the line on: extrapolate
      // from the last bar's logical index and the bar length.
      if (x === null && a && line.time > a.lastTime) {
        const logical = a.lastLogical + (line.time - a.lastTime) / a.barSeconds;
        x = timeScale.logicalToCoordinate(logical as Logical);
      }
      if (x === null) continue;
      out.push({ x, label: line.label, color: line.color, dashed: line.dashed, row: line.row });
    }
    return out.length > 0 ? out : null;
  }
}

type LinePoint = { x: number; label: string; color: string; dashed: boolean; row: number };

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
  constructor(private readonly _lines: LinePoint[]) {}

  draw(target: DrawTarget): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const height = scope.mediaSize.height;

      for (const { x, label, color, dashed, row } of this._lines) {
        // Zoomed out, the markers bunch up: keep the lines but drop the dashed
        // labels rather than print them on top of each other.
        const crowded =
          dashed && this._lines.some((o) => o.x !== x && o.row === row && Math.abs(o.x - x) < 44);
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash(dashed ? [4, 4] : []);
        ctx.strokeStyle = color;
        ctx.lineWidth = dashed ? 1 : 1.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "11px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        // Each market gets its own pair of label lines: dashed marks on the
        // first, open/close on the second.
        if (!crowded) ctx.fillText(label, x, 6 + row * 14);
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

/** Local clock time of an instant, "13:30". */
function localHHMM(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "09:30" → seconds after local midnight. */
function hhmmSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60;
}

export interface SessionMarket {
  short: string;
  tz: string;
  open: string;
  close: string;
  color: string;
}

export interface SessionOptions {
  /** Minutes either side of the open for the dashed flank lines */
  offsetMinutes: number;
  flanks: boolean;
  close: boolean;
  /** Minutes before the close for the dashed "last hour" line (0 = none) */
  preCloseMinutes: number;
  /** Color of the flank lines */
  flankColor: string;
}

/**
 * The most recent session of each market: its open, the flanking markers, the
 * line some minutes before the close and the close itself. Only the latest
 * session is drawn per market — a line per day turns the chart into a barcode.
 * Weekends are skipped (the exchanges are shut; crypto trades on).
 *
 * Only meaningful intraday — on a daily chart or above the lines would land on
 * (or between) whole bars, so callers get an empty list back.
 */
export function sessionLines(
  candles: { time: number }[],
  markets: SessionMarket[],
  opts: SessionOptions,
): SessionLine[] {
  if (candles.length < 2) return [];

  const barSeconds = candles[1].time - candles[0].time;
  if (barSeconds <= 0 || barSeconds >= 86_400) return [];

  const first = candles[0].time;
  const last = candles[candles.length - 1].time;
  const offset = opts.offsetMinutes * 60;
  const preClose = Math.max(0, opts.preCloseMinutes) * 60;
  const span = offsetLabel(opts.offsetMinutes);
  const snap = (t: number) =>
    // Marks on loaded bars snap to the bar that contains them (timeToCoordinate
    // needs a real bar time); future ones keep their exact instant.
    (t <= last ? Math.floor(t / barSeconds) * barSeconds : t) as UTCTimestamp;

  const out: SessionLine[] = [];
  markets.forEach((m, i) => {
    const openSec = hhmmSeconds(m.open);
    let closeSec = hhmmSeconds(m.close);
    if (closeSec <= openSec) closeSec += 86_400; // overnight session
    const flankRow = i * 2;
    const mainRow = i * 2 + 1;

    // Walk back from the day after the last bar (Sydney opens the previous
    // UTC evening) to the latest session that has begun.
    for (let day = Math.floor(last / 86_400) + 1; day >= Math.floor(first / 86_400) - 1; day--) {
      const weekday = new Date(day * 86_400_000).getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      const midnightUtc = day * 86_400;
      // The UTC instant of a local time depends on that day's DST, so read the
      // zone's real offset around the open rather than assuming a fixed one.
      const tzOffset = tzOffsetSeconds(midnightUtc + openSec, m.tz);
      const open = midnightUtc + openSec - tzOffset;
      const close = midnightUtc + closeSec - tzOffset;
      const firstMark = opts.flanks ? open - offset : open;
      if (firstMark > last) continue; // this session hasn't started yet

      const marks: SessionLine[] = [];
      if (opts.flanks) {
        marks.push({ time: snap(open - offset), label: `${m.short} -${span}`, color: opts.flankColor, dashed: true, row: flankRow });
      }
      marks.push({ time: snap(open), label: `Apertura ${m.short} ${localHHMM(open)}`, color: m.color, dashed: false, row: mainRow });
      if (opts.flanks) {
        marks.push({ time: snap(open + offset), label: `${m.short} +${span}`, color: opts.flankColor, dashed: true, row: flankRow });
      }
      if (opts.close && preClose > 0 && close - preClose > open) {
        marks.push({ time: snap(close - preClose), label: `${m.short} -${offsetLabel(preClose / 60)} cierre`, color: m.color, dashed: true, row: flankRow });
      }
      if (opts.close) {
        marks.push({ time: snap(close), label: `Cierre ${m.short} ${localHHMM(close)}`, color: m.color, dashed: false, row: mainRow });
      }
      out.push(...marks.filter((mk) => mk.time >= first));
      break;
    }
  });
  return out;
}
