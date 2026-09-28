"use client";

import { RefreshCw } from "lucide-react";
import { BRAND_NAME, LogoMark } from "@/components/brand/Logo";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { LayoutSwitch } from "@/components/header/LayoutSwitch";
import { MarketSourceSelect } from "@/components/header/MarketSourceSelect";
import { useChartStore } from "@/lib/store/chart-store";

/**
 * Top bar: brand · layout · symbol search · market · refresh · timeframes ·
 * indicators. On phones the secondary controls move to the bottom tab bar.
 */
export function Header() {
  const reload = useChartStore((s) => s.reload);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-tv-border bg-tv-panel px-2 md:px-3">
      <div className="flex shrink-0 items-center gap-2 pr-1">
        <LogoMark className="h-6 w-6" />
        <span className="hidden text-[15px] font-semibold tracking-tight text-tv-text lg:inline">
          {BRAND_NAME}
        </span>
      </div>

      <div className="hidden h-6 w-px shrink-0 bg-tv-border lg:block" />

      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none">
        <div className="hidden md:block">
          <LayoutSwitch />
        </div>
        <SymbolSelector />
        <div className="hidden md:block">
          <MarketSourceSelect />
        </div>
        <button
          type="button"
          onClick={reload}
          title="Recargar datos"
          aria-label="Recargar datos"
          className="hidden shrink-0 rounded-md p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text md:block"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <TimeframeSelector />
        <div className="hidden md:block">
          <IndicatorMenu />
        </div>
      </div>
    </header>
  );
}
