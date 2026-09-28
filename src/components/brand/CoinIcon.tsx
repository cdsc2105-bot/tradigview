import { cn } from "@/lib/utils";

/** Brand-neutral coin badges: a colored disc with a glyph, no third-party logos. */
const COINS: Record<string, { bg: string; fg?: string; glyph?: string }> = {
  BTC: { bg: "#f7931a", glyph: "₿" },
  ETH: { bg: "#627eea", glyph: "Ξ" },
  SOL: { bg: "#9945ff" },
  BNB: { bg: "#f3ba2f", fg: "#1a1a1a" },
  XRP: { bg: "#3b4252" },
  DOGE: { bg: "#c2a633", glyph: "Ð" },
  ADA: { bg: "#0033ad" },
  AVAX: { bg: "#e84142" },
  LINK: { bg: "#2a5ada" },
  DOT: { bg: "#e6007a" },
  LTC: { bg: "#345d9d", glyph: "Ł" },
  TRX: { bg: "#d4232b" },
  HYPE: { bg: "#50d2c1", fg: "#0b1a19" },
  SUI: { bg: "#4da2ff" },
  PEPE: { bg: "#3d9a3d" },
  TON: { bg: "#0098ea" },
};

/** Base asset of a pair ("BTCUSDT" → "BTC"); stocks pass through unchanged. */
export function baseAsset(symbol: string): string {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol.replace(/^\^/, "");
}

export function CoinIcon({ symbol, className }: { symbol: string; className?: string }) {
  const base = baseAsset(symbol);
  const def = COINS[base];
  const bg = def?.bg ?? "#313a4a";
  const glyph = def?.glyph ?? base.charAt(0);
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: bg, color: def?.fg ?? "#fff" }}
      className={cn(
        "inline-flex h-[18px] w-[18px] shrink-0 select-none items-center justify-center rounded-full text-[10px] font-bold leading-none",
        className,
      )}
    >
      {glyph}
    </span>
  );
}
