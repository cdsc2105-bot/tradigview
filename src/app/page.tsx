"use client";

import { Header } from "@/components/layout/Header";
import { DrawingRail, DrawingStyleBar } from "@/components/drawing/DrawingRail";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { PriceChart } from "@/components/chart/PriceChart";
import { ChartClock } from "@/components/chart/ChartClock";
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
        {/* Drawing tools — hidden on phones (they live in the tab bar there) */}
        <div className="hidden md:flex">
          <DrawingRail />
        </div>
        {/* min-w-0 lets the chart shrink below the canvas's intrinsic width
            (flexbox min-width:auto would otherwise pin it to desktop size) */}
        <main className="relative min-h-0 min-w-0 flex-1 bg-tv-chart">
          <PriceChart symbol={symbol} timeframe={timeframe} exchange={exchange} />
          <DrawingStyleBar />
          <ChartClock />
        </main>
        <RightSidebar />
      </div>
      <MobileTabBar />
      <IndicatorSettingsDialog />
    </div>
  );
}
