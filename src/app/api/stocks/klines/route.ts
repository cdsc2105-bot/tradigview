import { NextResponse } from "next/server";

/**
 * Server-side proxy to Yahoo Finance for stock/index candles.
 *
 * The browser can't call Yahoo directly (no CORS headers), so this route does
 * it and returns candles in the same shape the crypto venues use.
 */
const YF = "https://query1.finance.yahoo.com/v8/finance/chart";

/**
 * Our timeframe → Yahoo interval + how much history to ask for. Yahoo has no
 * 3m/2h/4h, so those are aggregated from the next smaller interval.
 */
const MAP: Record<string, { interval: string; range: string; bucket?: number }> = {
  "1m": { interval: "1m", range: "5d" },
  "2m": { interval: "1m", range: "5d", bucket: 120 },
  "3m": { interval: "1m", range: "5d", bucket: 180 },
  "5m": { interval: "5m", range: "60d" },
  "15m": { interval: "15m", range: "60d" },
  "30m": { interval: "30m", range: "60d" },
  "1h": { interval: "60m", range: "730d" },
  "2h": { interval: "60m", range: "730d", bucket: 7200 },
  "4h": { interval: "60m", range: "730d", bucket: 14400 },
  "1d": { interval: "1d", range: "10y" },
  "3d": { interval: "1d", range: "10y", bucket: 259200 },
  "1w": { interval: "1wk", range: "10y" },
  "1M": { interval: "1mo", range: "10y" },
};

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Roll bars up into fixed-width buckets (for the intervals Yahoo lacks). */
function aggregate(bars: Bar[], bucket: number): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const t = Math.floor(b.time / bucket) * bucket;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else {
      out.push({ ...b, time: t });
    }
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const tf = searchParams.get("interval") ?? "5m";
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const cfg = MAP[tf] ?? MAP["5m"];
  const url = `${YF}/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `yahoo ${res.status}` }, { status: 502 });
    }
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const q = r?.indicators?.quote?.[0] ?? {};

    const bars: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      const c = q.close?.[i];
      // Yahoo pads holidays/halts with nulls — skip those slots entirely
      if (o == null || h == null || l == null || c == null) continue;
      bars.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
    }

    return NextResponse.json(cfg.bucket ? aggregate(bars, cfg.bucket) : bars);
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
