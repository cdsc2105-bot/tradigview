"use client";

import { useMemo, useState } from "react";
import { Activity, Check, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useChartStore,
  type IndicatorConfig,
  type IndicatorKey,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface Entry {
  key: IndicatorKey;
  group: string;
  label: (cfg: IndicatorConfig) => string;
  desc: string;
  /** Extra search terms (aliases) so "media", "cipher", "cloud"… all resolve */
  keywords: string;
}

const GROUP_ORDER = [
  "Medias móviles",
  "Osciladores",
  "Bandas",
  "Tendencia",
  "Volumen",
];

const ENTRIES: Entry[] = [
  {
    key: "ribbon",
    group: "Medias móviles",
    label: (c) =>
      `Cinta EMAs (${c.ribbonLines
        .filter((l) => l.enabled)
        .map((l) => l.period)
        .join("/")})`,
    desc: "Varias EMAs juntas con relleno. Agregas/quitas líneas y colores.",
    keywords: "media movil moving average ribbon cinta ema exponencial tendencia",
  },
  {
    key: "ema20",
    group: "Medias móviles",
    label: (c) => `EMA ${c.ema20}`,
    desc: "Media móvil exponencial rápida.",
    keywords: "media movil moving average ema exponencial rapida",
  },
  {
    key: "ema50",
    group: "Medias móviles",
    label: (c) => `EMA ${c.ema50}`,
    desc: "Media móvil exponencial intermedia.",
    keywords: "media movil moving average ema exponencial",
  },
  {
    key: "ema200",
    group: "Medias móviles",
    label: (c) => `EMA ${c.ema200}`,
    desc: "Media móvil de fondo, la gran tendencia.",
    keywords: "media movil moving average ema exponencial lenta tendencia",
  },
  {
    key: "rsi",
    group: "Osciladores",
    label: (c) => `RSI (${c.rsi})`,
    desc: "Fuerza relativa. Sobrecompra/sobreventa.",
    keywords: "rsi fuerza relativa oscilador momentum sobrecompra sobreventa",
  },
  {
    key: "macd",
    group: "Osciladores",
    label: (c) => `MACD (${c.macdFast}, ${c.macdSlow}, ${c.macdSignal})`,
    desc: "Convergencia/divergencia de medias.",
    keywords: "macd oscilador momentum convergencia divergencia",
  },
  {
    key: "stoch",
    group: "Osciladores",
    label: (c) => `Stochastic (${c.stochK}, ${c.stochD}, ${c.stochSmooth})`,
    desc: "Estocástico. Giros de momentum.",
    keywords: "stochastic estocastico oscilador momentum",
  },
  {
    key: "wavetrend",
    group: "Osciladores",
    label: (c) => `WaveTrend (${c.wtChannel}, ${c.wtAvg}, ${c.wtSignal})`,
    desc: "El oscilador tipo Cipher (dos líneas azul/naranja).",
    keywords: "wavetrend cipher wt oscilador momentum ondas",
  },
  {
    key: "bb",
    group: "Bandas",
    label: (c) => `Bollinger (${c.bbPeriod}, ${c.bbStdDev})`,
    desc: "Bandas de Bollinger. Volatilidad.",
    keywords: "bollinger bandas volatilidad desviacion",
  },
  {
    key: "supertrend",
    group: "Tendencia",
    label: (c) => `SuperTrend (${c.stPeriod}, ${c.stMultiplier})`,
    desc: "Seguidor de tendencia por ATR.",
    keywords: "supertrend tendencia atr seguidor stop",
  },
  {
    key: "ichimoku",
    group: "Tendencia",
    label: (c) =>
      `Ichimoku (${c.ichiTenkan}, ${c.ichiKijun}, ${c.ichiSenkouB})`,
    desc: "Nube de Ichimoku: tendencia, soporte/resistencia y momentum.",
    keywords: "ichimoku nube kumo cloud tenkan kijun senkou chikou tendencia japones",
  },
  {
    key: "vwap",
    group: "Volumen",
    label: (c) => (c.vwapBands > 0 ? `VWAP ±${c.vwapBands}σ` : "VWAP"),
    desc: "Precio medio por volumen + bandas de desviación (cloud).",
    keywords: "vwap volumen desviacion bandas cloud precio medio anclado",
  },
  {
    key: "volume",
    group: "Volumen",
    label: () => "Volumen",
    desc: "Barras de volumen por vela.",
    keywords: "volumen volume barras",
  },
];

export function IndicatorMenu() {
  const indicators = useChartStore((s) => s.indicators);
  const config = useChartStore((s) => s.config);
  const toggle = useChartStore((s) => s.toggleIndicator);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const activeCount = Object.values(indicators).filter(Boolean).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (e: Entry) =>
      !q ||
      e.label(config).toLowerCase().includes(q) ||
      e.group.toLowerCase().includes(q) ||
      e.keywords.includes(q);
    return ENTRIES.filter(match);
  }, [query, config]);

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of filtered) {
      if (!map.has(e.group)) map.set(e.group, []);
      map.get(e.group)!.push(e);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map(
      (g) => [g, map.get(g)!] as const,
    );
  }, [filtered]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover"
      >
        <Activity className="h-3.5 w-3.5" />
        <span>Indicadores</span>
        {activeCount > 0 && (
          <span className="ml-1 rounded bg-tv-blue/20 px-1.5 py-0.5 text-[10px] font-semibold text-tv-blue">
            {activeCount}
          </span>
        )}
      </button>

      {/* Conditionally mounted so it fully unmounts on close: base-ui's exit
          animation doesn't complete with this app's Tailwind setup, which would
          otherwise leave the dialog lingering visible. */}
      {open ? (
      <Dialog open onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          style={{ display: "flex", flexDirection: "column" }}
          className="max-h-[85vh] max-w-md gap-0 overflow-hidden bg-tv-panel p-0"
        >
          <DialogHeader className="border-b border-tv-border px-3 py-2.5">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm font-medium">
                Indicadores y métricas
              </DialogTitle>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>

          <div className="border-b border-tv-border p-2.5">
            <div className="flex items-center gap-2 rounded bg-tv-bg px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-tv-text-muted" />
              <Input
                autoFocus
                placeholder="Buscar: EMA, RSI, VWAP, Cipher…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0"
              />
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col py-1">
              {groups.length === 0 && (
                <div className="p-6 text-center text-xs text-tv-text-muted">
                  Sin resultados para “{query}”
                </div>
              )}
              {groups.map(([group, items]) => (
                <div key={group}>
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
                    {group}
                  </div>
                  {items.map((e) => {
                    const active = indicators[e.key];
                    return (
                      <button
                        key={e.key}
                        onClick={() => toggle(e.key)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-tv-panel-hover",
                          active && "bg-tv-blue/5",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                            active
                              ? "border-tv-blue bg-tv-blue text-white"
                              : "border-tv-border text-transparent",
                          )}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-tv-text">
                            {e.label(config)}
                          </div>
                          <div className="truncate text-[11px] text-tv-text-muted">
                            {e.desc}
                          </div>
                        </div>
                        {active && (
                          <span className="shrink-0 text-[10px] font-medium text-tv-blue">
                            Activo
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="border-t border-tv-border px-3 py-2 text-[11px] text-tv-text-muted">
            Clic para agregar/quitar · abre el ⚙️ del pill para configurar
          </div>
        </DialogContent>
      </Dialog>
      ) : null}
    </>
  );
}
