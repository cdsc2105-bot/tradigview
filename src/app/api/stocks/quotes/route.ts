import { NextResponse } from "next/server";

/**
 * Server-side proxy for stock/index quotes (watchlist rows).
 *
 * Yahoo's batch quote endpoint now needs a session crumb, so this fans out to
 * the chart endpoint per symbol — it returns the last price and the previous
 * close in `meta`, which is all a watchlist row needs.
 */
const YF = "https://query1.finance.yahoo.com/v8/finance/chart";

async function quote(symbol: string) {
  const url = `${YF}/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  const m = json?.chart?.result?.[0]?.meta;
  if (!m) return null;

  const lastPrice = Number(m.regularMarketPrice ?? 0);
  const prevClose = Number(m.chartPreviousClose ?? m.previousClose ?? lastPrice);
  const priceChange = lastPrice - prevClose;
  return {
    symbol,
    lastPrice,
    priceChange,
    priceChangePercent: prevClose === 0 ? 0 : (priceChange / prevClose) * 100,
    highPrice: Number(m.regularMarketDayHigh ?? 0),
    lowPrice: Number(m.regularMarketDayLow ?? 0),
    volume: Number(m.regularMarketVolume ?? 0),
    quoteVolume: 0,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (symbols.length === 0) return NextResponse.json([]);

  const results = await Promise.all(
    symbols.map((s) => quote(s).catch(() => null)),
  );
  return NextResponse.json(results.filter(Boolean));
}
