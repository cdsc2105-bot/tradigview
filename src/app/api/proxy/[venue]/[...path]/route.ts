import { NextResponse } from "next/server";

/**
 * Server-side relay for public market data. Many networks and countries
 * block Binance (and sometimes Bitget) from the browser; this route fetches
 * the same public endpoints from the server instead, so charts, prices and
 * symbol lists still load. Only the read-only endpoints the app uses are
 * allowed — this is not an open proxy.
 */

const VENUES: Record<string, { hosts: string[]; paths: RegExp }> = {
  binance: {
    hosts: ["https://api.binance.com", "https://data-api.binance.vision"],
    paths: /^\/api\/v3\/(klines|ticker\/24hr|ticker\/price|exchangeInfo)$/,
  },
  binancef: {
    hosts: ["https://fapi.binance.com"],
    paths: /^\/fapi\/v1\/(klines|ticker\/24hr|ticker\/price|exchangeInfo)$/,
  },
  bitget: {
    hosts: ["https://api.bitget.com"],
    paths: /^\/api\/v2\/mix\/market\/(candles|history-candles|tickers|ticker|contracts)$/,
  },
};

/** CDN cache per endpoint: symbol lists barely change, prices do. */
function cacheControl(path: string, query: URLSearchParams): string {
  if (/exchangeInfo|contracts/.test(path)) return "public, s-maxage=3600, stale-while-revalidate=86400";
  // Closed history (paged with endTime) never changes
  if (query.has("endTime")) return "public, s-maxage=86400";
  return "public, s-maxage=1, stale-while-revalidate=2";
}

interface RawSymbol {
  symbol: string;
  baseAsset?: string;
  quoteAsset?: string;
  status?: string;
  contractType?: string;
  filters?: { filterType: string; tickSize?: string }[];
}

/**
 * exchangeInfo is several MB (mostly permission sets and filters the app never
 * reads); keep just the fields it parses so the response stays small.
 */
function compactExchangeInfo(data: { symbols?: RawSymbol[] }) {
  return {
    symbols: (data.symbols ?? []).map((s) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      status: s.status,
      contractType: s.contractType,
      filters: (s.filters ?? [])
        .filter((f) => f.filterType === "PRICE_FILTER")
        .map((f) => ({ filterType: f.filterType, tickSize: f.tickSize })),
    })),
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ venue: string; path: string[] }> },
) {
  const { venue, path } = await params;
  const cfg = VENUES[venue];
  const upstreamPath = `/${path.join("/")}`;
  if (!cfg || !cfg.paths.test(upstreamPath)) {
    return NextResponse.json({ error: "not allowed" }, { status: 404 });
  }

  const query = new URL(req.url).searchParams;
  let lastStatus = 502;
  for (const host of cfg.hosts) {
    try {
      const res = await fetch(`${host}${upstreamPath}?${query}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        lastStatus = res.status;
        // A bad request won't get better on another host
        if (res.status === 400) break;
        continue;
      }
      let body = await res.json();
      if (upstreamPath.endsWith("/exchangeInfo")) body = compactExchangeInfo(body);
      return NextResponse.json(body, {
        headers: { "Cache-Control": cacheControl(upstreamPath, query) },
      });
    } catch {
      lastStatus = 504;
    }
  }
  return NextResponse.json({ error: "upstream unavailable" }, { status: lastStatus });
}
