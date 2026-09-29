import type { Exchange } from "@/lib/store/chart-store";
import { stockLabel } from "@/lib/exchanges/stocks";
import { stockOf } from "@/lib/exchanges/venues";

/**
 * Names and kinds for what the watchlist and the symbol search show, taken
 * from CdeCripto's market catalog. The exchanges only give us bare symbols.
 */

/** Full names of the coins people actually trade, by ticker. */
export const COIN_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  HYPE: "Hyperliquid",
  SOL: "Solana",
  XRP: "XRP",
  DOGE: "Dogecoin",
  BNB: "BNB",
  ZEC: "Zcash",
  ADA: "Cardano",
  SUI: "Sui",
  LINK: "Chainlink",
  PEPE: "Pepe",
  LTC: "Litecoin",
  BCH: "Bitcoin Cash",
  AVAX: "Avalanche",
  NEAR: "Near",
  TRX: "TRON",
  PUMP: "Pump.fun",
  UNI: "Uniswap",
  AAVE: "Aave",
  TAO: "Bittensor",
  ENA: "Ethena",
  XLM: "Stellar",
  WLD: "Worldcoin",
  ONDO: "Ondo",
  DOT: "Polkadot",
  FIL: "Filecoin",
  XMR: "Monero",
  KAITO: "Kaito",
  ARB: "Arbitrum",
  OP: "Optimism",
  APT: "Aptos",
  INJ: "Injective",
  SEI: "Sei",
  JUP: "Jupiter",
  ATOM: "Cosmos",
  ETC: "Ethereum Classic",
  RENDER: "Render",
  GRAM: "Gram",
  PENDLE: "Pendle",
  SHIB: "Shiba Inu",
  BONK: "Bonk",
  TRUMP: "TRUMP",
  WIF: "dogwifhat",
  PENGU: "Pudgy Penguins",
  FLOKI: "FLOKI",
  FARTCOIN: "Fartcoin",
  SPX: "SPX6900",
  POPCAT: "Popcat",
  TURBO: "Turbo",
  AERO: "Aerodrome",
};

/**
 * Tokenized stocks, indices and ETFs listed as USDT perpetuals on Bitget.
 * The search shows them under "Acciones"; delisted ones drop out because every
 * list is checked against Bitget's live symbol list first.
 */
export const TOKENIZED_STOCKS: { symbol: string; ticker: string; name: string }[] = [
  { symbol: "SP500USDT", ticker: "SP500", name: "S&P 500" },
  { symbol: "NDX100USDT", ticker: "NDX100", name: "Nasdaq-100" },
  { symbol: "SPYUSDT", ticker: "SPY", name: "SPDR S&P 500" },
  { symbol: "QQQUSDT", ticker: "QQQ", name: "Invesco QQQ" },
  { symbol: "NVDAUSDT", ticker: "NVDA", name: "NVIDIA" },
  { symbol: "AAPLUSDT", ticker: "AAPL", name: "Apple" },
  { symbol: "MSFTUSDT", ticker: "MSFT", name: "Microsoft" },
  { symbol: "AMZNUSDT", ticker: "AMZN", name: "Amazon" },
  { symbol: "GOOGLUSDT", ticker: "GOOGL", name: "Alphabet" },
  { symbol: "METAUSDT", ticker: "META", name: "Meta" },
  { symbol: "TSLAUSDT", ticker: "TSLA", name: "Tesla" },
  { symbol: "AMDUSDT", ticker: "AMD", name: "AMD" },
  { symbol: "NFLXUSDT", ticker: "NFLX", name: "Netflix" },
  { symbol: "COINUSDT", ticker: "COIN", name: "Coinbase" },
  { symbol: "MSTRUSDT", ticker: "MSTR", name: "MicroStrategy" },
  { symbol: "CRCLUSDT", ticker: "CRCL", name: "Circle" },
  { symbol: "ORCLUSDT", ticker: "ORCL", name: "Oracle" },
  { symbol: "INTCUSDT", ticker: "INTC", name: "Intel" },
  { symbol: "TSMUSDT", ticker: "TSM", name: "TSMC" },
  { symbol: "MUUSDT", ticker: "MU", name: "Micron" },
  { symbol: "AEHRUSDT", ticker: "AEHR", name: "Aehr Test" },
  { symbol: "ANTHROPICUSDT", ticker: "ANTHROPIC", name: "Anthropic" },
  { symbol: "BMNRUSDT", ticker: "BMNR", name: "BMNR" },
  { symbol: "DRAMUSDT", ticker: "DRAM", name: "DRAM" },
  { symbol: "EWYUSDT", ticker: "EWY", name: "EWY" },
  { symbol: "FLEXUSDT", ticker: "FLEX", name: "Flex" },
  { symbol: "FLNCUSDT", ticker: "FLNC", name: "Fluence" },
  { symbol: "GLWUSDT", ticker: "GLW", name: "Corning" },
  { symbol: "IRENUSDT", ticker: "IREN", name: "Iris Energy" },
  { symbol: "KIOXIAUSDT", ticker: "KIOXIA", name: "Kioxia" },
  { symbol: "KORUUSDT", ticker: "KORU", name: "KORU" },
  { symbol: "LWLGUSDT", ticker: "LWLG", name: "Lightwave Logic" },
  { symbol: "MRVLUSDT", ticker: "MRVL", name: "Marvell" },
  { symbol: "MUUUSDT", ticker: "MUU", name: "MUU" },
  { symbol: "MVLLUSDT", ticker: "MVLL", name: "MVLL" },
  { symbol: "NBISUSDT", ticker: "NBIS", name: "Nebius" },
  { symbol: "OSSUSDT", ticker: "OSS", name: "One Stop Systems" },
  { symbol: "PENGUSDT", ticker: "PENG", name: "PENG" },
  { symbol: "RAMUSDT", ticker: "RAM", name: "RAM" },
  { symbol: "SAMSUNGUSDT", ticker: "SAMSUNG", name: "Samsung" },
  { symbol: "SKHYUSDT", ticker: "SKHY", name: "SKHY" },
  { symbol: "SKHYNIXUSDT", ticker: "SKHYNIX", name: "SK Hynix" },
  { symbol: "SMHUSDT", ticker: "SMH", name: "SMH" },
  { symbol: "SNDKUSDT", ticker: "SNDK", name: "Sandisk" },
  { symbol: "SNXXUSDT", ticker: "SNXX", name: "SNXX" },
  { symbol: "SOXLUSDT", ticker: "SOXL", name: "SOXL" },
  { symbol: "SOXSUSDT", ticker: "SOXS", name: "SOXS" },
  { symbol: "SPCXUSDT", ticker: "SPCX", name: "SPCX" },
  { symbol: "SQQQUSDT", ticker: "SQQQ", name: "SQQQ" },
  { symbol: "STXSTOCKUSDT", ticker: "STXSTOCK", name: "Seagate" },
  { symbol: "TSEMUSDT", ticker: "TSEM", name: "Tower Semi" },
  { symbol: "TSLLUSDT", ticker: "TSLL", name: "TSLL" },
  { symbol: "ZHIPUUSDT", ticker: "ZHIPU", name: "Zhipu" },
];

const TOKENIZED_BY_SYMBOL = new Map(TOKENIZED_STOCKS.map((s) => [s.symbol, s]));
const TOKENIZED_BY_TICKER = new Map(TOKENIZED_STOCKS.map((s) => [s.ticker, s]));

/** Coins that only trade in lots of 1000 on the perp venues (1000PEPEUSDT). */
const LOT_PREFIX = /^1000+(?=[A-Z])/;

export type MarketKind = "crypto" | "stock";

export interface Market {
  symbol: string;
  exchange: Exchange;
  /** Short name for the row and the avatar letter: BTC, NVDA, S&P 500 */
  ticker: string;
  name: string;
  kind: MarketKind;
}

export function isTokenizedStock(exchange: Exchange, symbol: string): boolean {
  return exchange === "bitget" && TOKENIZED_BY_SYMBOL.has(symbol);
}

export function kindOf(exchange: Exchange, symbol: string): MarketKind {
  return exchange === "stocks" ||
    isTokenizedStock(exchange, symbol) ||
    stockOf(exchange, symbol) !== null
    ? "stock"
    : "crypto";
}

export function tickerOf(exchange: Exchange, symbol: string): string {
  if (exchange === "stocks") return stockLabel(symbol);
  const tokenized = exchange === "bitget" ? TOKENIZED_BY_SYMBOL.get(symbol) : undefined;
  if (tokenized) return tokenized.ticker;
  return symbol.replace(/USDT$/, "").replace(LOT_PREFIX, "");
}

export function marketOf(exchange: Exchange, symbol: string): Market {
  const ticker = tickerOf(exchange, symbol);
  const kind = kindOf(exchange, symbol);
  const name =
    kind === "crypto"
      ? (COIN_NAMES[ticker] ?? ticker)
      : exchange === "stocks"
        ? // Yahoo: company name when we know it, else the raw code (^GSPC)
          (TOKENIZED_BY_TICKER.get(symbol)?.name ?? symbol)
        : (TOKENIZED_BY_SYMBOL.get(symbol)?.name ?? symbol);
  return { symbol, exchange, ticker, name, kind };
}
