"use client";

import { useState, type ReactNode } from "react";
import { Activity, CandlestickChart, List, PenTool, SlidersHorizontal, X } from "lucide-react";
import { IndicatorList } from "@/components/chart/IndicatorMenu";
import { LayoutSwitch } from "@/components/header/LayoutSwitch";
import {
  MarketOptionRow,
  useMarketOptions,
  useSwitchMarket,
} from "@/components/header/MarketSourceSelect";
import { TOOLS } from "@/components/layout/LeftSidebar";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

type Sheet = "indicators" | "tools" | "more" | null;

/** Bottom sheet for phones — slides over the chart, tap outside to close. */
function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div onClick={onClose} className="absolute inset-0 animate-fade-in bg-black/60" />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[75dvh] flex-col rounded-t-2xl border-t border-tv-border-strong bg-tv-surface pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-tv-text">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-tv-text-muted hover:text-tv-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{children}</div>
      </div>
    </div>
  );
}

/** Phone navigation: Gráfico · Mercados · Indicadores · Herramientas · Más. */
export function MobileTabBar() {
  const [sheet, setSheet] = useState<Sheet>(null);
  const watchlistOpen = useChartStore((s) => s.watchlistOpen);
  const setWatchlistOpen = useChartStore((s) => s.setWatchlistOpen);
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const exchange = useChartStore((s) => s.exchange);
  const reload = useChartStore((s) => s.reload);
  const switchMarket = useSwitchMarket();
  const markets = useMarketOptions(sheet === "more");

  const tabs = [
    {
      key: "chart",
      label: "Gráfico",
      icon: CandlestickChart,
      active: !sheet && !watchlistOpen,
      onClick: () => {
        setSheet(null);
        setWatchlistOpen(false);
      },
    },
    {
      key: "markets",
      label: "Mercados",
      icon: List,
      active: watchlistOpen,
      onClick: () => {
        setSheet(null);
        setWatchlistOpen(true);
      },
    },
    {
      key: "indicators",
      label: "Indicadores",
      icon: Activity,
      active: sheet === "indicators",
      onClick: () => setSheet("indicators"),
    },
    {
      key: "tools",
      label: "Herramientas",
      icon: PenTool,
      active: sheet === "tools",
      onClick: () => setSheet("tools"),
    },
    {
      key: "more",
      label: "Más",
      icon: SlidersHorizontal,
      active: sheet === "more",
      onClick: () => setSheet("more"),
    },
  ];

  return (
    <>
      <nav className="flex shrink-0 border-t border-tv-border bg-tv-panel pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={t.onClick}
              className="flex flex-1 flex-col items-center gap-0.5 py-1.5"
            >
              <span
                className={cn(
                  "flex h-7 w-11 items-center justify-center rounded-lg transition-colors",
                  t.active ? "bg-tv-accent/20 text-tv-text" : "text-tv-text-muted",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span
                className={cn(
                  "text-[10px]",
                  t.active ? "text-tv-text" : "text-tv-text-muted",
                )}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>

      {sheet === "indicators" && (
        <BottomSheet title="Indicadores" onClose={() => setSheet(null)}>
          <IndicatorList onEdit={() => setSheet(null)} />
        </BottomSheet>
      )}

      {sheet === "tools" && (
        <BottomSheet title="Herramientas" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-3 gap-2 px-2">
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setTool(t.key);
                    setSheet(null);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[11px]",
                    tool === t.key
                      ? "border-tv-accent bg-tv-accent/10 text-tv-text"
                      : "border-tv-border text-tv-text-muted",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </BottomSheet>
      )}

      {sheet === "more" && (
        <BottomSheet title="Más" onClose={() => setSheet(null)}>
          <div className="space-y-4 px-2">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-tv-text-dim">
                Vista
              </div>
              <LayoutSwitch />
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-tv-text-dim">
                Mercado
              </div>
              <div className="mb-1 text-[11px] text-tv-text-muted">{markets.title}</div>
              <div className="flex flex-col gap-1">
                {markets.options.map((o) => (
                  <MarketOptionRow
                    key={o.key}
                    option={o}
                    active={exchange === o.key}
                    className="border border-tv-border"
                    onPick={() => {
                      void switchMarket(o.key);
                      setSheet(null);
                    }}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                reload();
                setSheet(null);
              }}
              className="w-full rounded-lg border border-tv-border px-3 py-2 text-[13px] text-tv-text"
            >
              Recargar datos
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
