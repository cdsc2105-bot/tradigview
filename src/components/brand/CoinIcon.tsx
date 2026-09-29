"use client";

import { useState } from "react";
import { CRYPTO_ICONS, STOCK_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Short labels for indices and ETFs, which have no logo of their own. */
const INDEX_LABELS: Record<string, string> = {
  "^GSPC": "SPX",
  "^IXIC": "NDQ",
  "^DJI": "DJI",
  SPY: "SPY",
  QQQ: "QQQ",
};

/**
 * Base asset of a pair ("BTCUSDT" → "BTC"). Futures list some coins per 1000
 * ("1000PEPEUSDT"), so the multiplier is dropped too.
 */
export function baseAsset(symbol: string): string {
  const base = symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol.replace(/^\^/, "");
  return base.replace(/^(1000+|1M)(?=[A-Z])/, "");
}

/** Where to find an asset's logo, or null when there is no official one. */
function logoUrl(symbol: string): { src: string; stock: boolean } | null {
  if (STOCK_ICONS.has(symbol)) return { src: `/icons/stocks/${symbol}.svg`, stock: true };
  const base = baseAsset(symbol);
  if (CRYPTO_ICONS.has(base)) return { src: `/icons/crypto/${base}.svg`, stock: false };
  // Not bundled: the same open icon set, served by Iconify. A miss falls back
  // to the neutral placeholder below rather than to a made-up logo.
  if (symbol.endsWith("USDT")) {
    return {
      src: `https://api.iconify.design/token-branded/${base.toLowerCase()}-background.svg`,
      stock: false,
    };
  }
  return null;
}

/** The asset's official logo, or a neutral badge when it has none. */
export function CoinIcon({ symbol, className }: { symbol: string; className?: string }) {
  const logo = logoUrl(symbol);
  const [failed, setFailed] = useState<string | null>(null);
  const box = cn("inline-flex h-[18px] w-[18px] shrink-0 select-none rounded-full", className);

  if (logo && failed !== logo.src) {
    return logo.stock ? (
      // Company logos sit on white, as most of them are designed for it
      <span className={cn(box, "items-center justify-center bg-white")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} alt="" className="h-[70%] w-[70%] object-contain" onError={() => setFailed(logo.src)} />
      </span>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo.src} alt="" className={cn(box, "object-cover")} onError={() => setFailed(logo.src)} />
    );
  }

  const label = INDEX_LABELS[symbol];
  return (
    <span
      aria-hidden="true"
      className={cn(
        box,
        "items-center justify-center bg-tv-border-strong font-bold leading-none text-tv-text",
        label ? "text-[6px] tracking-tight" : "text-[10px]",
      )}
    >
      {label ?? baseAsset(symbol).charAt(0)}
    </span>
  );
}
