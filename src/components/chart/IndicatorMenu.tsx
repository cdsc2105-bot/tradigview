"use client";

import { useState } from "react";
import { Activity, ChevronDown, Settings2 } from "lucide-react";
import { PopoverHeading, PopoverPanel } from "@/components/ui/popover-panel";
import {
  useChartStore,
  type IndicatorConfig,
  type IndicatorKey,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface Entry {
  key: IndicatorKey;
  label: string;
  /** Current parameters, shown muted next to the name */
  params?: (cfg: IndicatorConfig) => string;
}

const GROUPS: { title: string; entries: Entry[] }[] = [
  {
    title: "Precio",
    entries: [
      {
        key: "vwap",
        label: "VWAP + Bandas σ",
        params: (c) =>
          c.vwapBandLines
            .filter((b) => b.enabled && b.multiplier > 0)
            .map((b) => b.multiplier)
            .sort((a, b) => a - b)
            .join(" · "),
      },
      { key: "volume", label: "Volumen" },
      {
        key: "ribbon",
        label: "Medias móviles",
        params: (c) =>
          c.ribbonLines
            .filter((l) => l.enabled)
            .map((l) => l.period)
            .join(" · "),
      },
      { key: "session", label: "Sesiones de mercado" },
    ],
  },
  {
    title: "Osciladores",
    entries: [
      { key: "rsi", label: "RSI", params: (c) => String(c.rsi) },
      {
        key: "stochrsi",
        label: "Stoch RSI",
        params: (c) => `${c.srsiRsiLen} · ${c.srsiStochLen} · ${c.srsiK} · ${c.srsiD}`,
      },
      { key: "cipher", label: "Cipher WaveTrend" },
    ],
  },
  {
    title: "Más indicadores",
    entries: [
      { key: "ema20", label: "EMA", params: (c) => String(c.ema20) },
      { key: "ema50", label: "EMA", params: (c) => String(c.ema50) },
      { key: "ema200", label: "EMA", params: (c) => String(c.ema200) },
      {
        key: "stoch",
        label: "Estocástico",
        params: (c) => `${c.stochK} · ${c.stochD} · ${c.stochSmooth}`,
      },
      {
        key: "wavetrend",
        label: "WaveTrend simple",
        params: (c) => `${c.wtChannel} · ${c.wtAvg} · ${c.wtSignal}`,
      },
      {
        key: "macd",
        label: "MACD",
        params: (c) => `${c.macdFast} · ${c.macdSlow} · ${c.macdSignal}`,
      },
      { key: "bb", label: "Bollinger", params: (c) => `${c.bbPeriod} · ${c.bbStdDev}` },
      { key: "supertrend", label: "SuperTrend", params: (c) => `${c.stPeriod} · ${c.stMultiplier}` },
      {
        key: "ichimoku",
        label: "Ichimoku",
        params: (c) => `${c.ichiTenkan} · ${c.ichiKijun} · ${c.ichiSenkouB}`,
      },
    ],
  },
];

/** Indicators with nothing to configure — no gear next to them. */
const NOT_CONFIGURABLE = new Set<IndicatorKey>(["volume"]);

function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors",
        on ? "bg-tv-accent" : "bg-tv-border-strong",
      )}
    >
      <span
        className={cn(
          "absolute h-[14px] w-[14px] rounded-full bg-white shadow transition-[left]",
          on ? "left-[14px]" : "left-[2px]",
        )}
      />
    </span>
  );
}

/**
 * The add/remove list, grouped like the chart reads top to bottom: what sits
 * on price, then the panes below. Every entry has a gear to edit it.
 */
export function IndicatorList({ onEdit }: { onEdit?: () => void }) {
  const indicators = useChartStore((s) => s.indicators);
  const config = useChartStore((s) => s.config);
  const toggle = useChartStore((s) => s.toggleIndicator);
  const setSettingsTarget = useChartStore((s) => s.setSettingsTarget);

  return (
    <div className="select-none">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <PopoverHeading>{g.title}</PopoverHeading>
          {g.entries.map((e) => {
            const on = indicators[e.key];
            const params = e.params?.(config);
            return (
              <div
                key={e.key}
                className="flex items-center rounded-md transition-colors hover:bg-tv-panel-hover"
              >
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => toggle(e.key)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-tv-text">
                    {e.label}
                    {params && (
                      <span className="ml-1.5 font-mono text-[11px] text-tv-text-muted">
                        {params}
                      </span>
                    )}
                  </span>
                  <Switch on={on} />
                </button>
                {NOT_CONFIGURABLE.has(e.key) ? (
                  <span className="w-[31px]" />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!on) toggle(e.key);
                      onEdit?.();
                      setSettingsTarget(e.key);
                    }}
                    title="Editar"
                    aria-label={`Editar ${e.label}`}
                    className="mr-1 rounded p-1.5 text-tv-text-dim hover:bg-tv-surface hover:text-tv-text"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function IndicatorMenu() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const activeCount = useChartStore(
    (s) => Object.values(s.indicators).filter(Boolean).length,
  );

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Indicadores"
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-tv-panel-hover",
          open ? "bg-tv-panel-hover text-tv-text" : "text-tv-text-muted hover:text-tv-text",
        )}
      >
        <Activity className="h-4 w-4" />
        <span className="hidden xl:inline">Indicadores</span>
        <span className="rounded bg-tv-accent/20 px-1.5 text-[10px] font-semibold text-tv-accent">
          {activeCount}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <PopoverPanel
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        className="w-[300px]"
      >
        <IndicatorList onEdit={() => setOpen(false)} />
      </PopoverPanel>
    </>
  );
}
