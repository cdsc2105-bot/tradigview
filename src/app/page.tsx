"use client";

import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { PriceChart } from "@/components/chart/PriceChart";
import { IndicatorSettingsDialog } from "@/components/chart/IndicatorSettingsDialog";
import { useChartStore } from "@/lib/store/chart-store";

export default function HomePage() {
  const symbol = useChartStore((s) => s.symbol);
  const exchange = useChartStore((s) => s.exchange);
  const timeframe = useChartStore((s) => s.timeframe);

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-tv-bg">
      <Header />
      <div className="flex min-h-0 min-w-0 flex-1">
        {/* Drawing tools — hidden on phones, shown from md up */}
        <div className="hidden md:flex">
          <LeftSidebar />
        </div>
        {/* min-w-0 lets the chart shrink below the canvas's intrinsic width
            (flexbox min-width:auto would otherwise pin it to desktop size) */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 min-w-0 flex-1">
            <PriceChart symbol={symbol} timeframe={timeframe} exchange={exchange} />
          </div>
        </main>
        <RightSidebar />
      </div>
      <BottomPanel />
      <IndicatorSettingsDialog />
    </div>
  );
}
