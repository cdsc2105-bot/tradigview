"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useChartStore,
  DEFAULT_CONFIG,
  MAX_RIBBON_LINES,
  type IndicatorKey,
} from "@/lib/store/chart-store";

const TITLES: Record<IndicatorKey, string> = {
  ema20: "EMA — Slot 1",
  ema50: "EMA — Slot 2",
  ema200: "EMA — Slot 3",
  rsi: "RSI",
  macd: "MACD",
  volume: "Volumen",
  bb: "Bollinger Bands",
  stoch: "Stochastic",
  supertrend: "SuperTrend",
  vwap: "VWAP",
  wavetrend: "WaveTrend",
  ribbon: "Cinta de EMAs",
};

export function IndicatorSettingsDialog() {
  const target = useChartStore((s) => s.settingsTarget);
  const setTarget = useChartStore((s) => s.setSettingsTarget);
  const config = useChartStore((s) => s.config);
  const setConfig = useChartStore((s) => s.setConfig);

  const open = target !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTarget(null);
      }}
    >
      <DialogContent
        className={cn(
          "bg-tv-panel",
          target === "ribbon" ? "max-w-md" : "max-w-sm",
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {target ? TITLES[target] : ""} — Configuración
          </DialogTitle>
        </DialogHeader>
        {target && (
          <SettingsForm
            target={target}
            config={config}
            onSave={(patch) => {
              setConfig(patch);
              setTarget(null);
            }}
            onReset={() => {
              setConfig(DEFAULT_CONFIG);
              setTarget(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  target: IndicatorKey;
  config: typeof DEFAULT_CONFIG;
  onSave: (patch: Partial<typeof DEFAULT_CONFIG>) => void;
  onReset: () => void;
}

function SettingsForm({ target, config, onSave, onReset }: FormProps) {
  // Local draft state to avoid recalculating chart on every keystroke
  const [draft, setDraft] = useState({ ...config });

  useEffect(() => {
    setDraft({ ...config });
  }, [config, target]);

  function save() {
    if (target === "ema20") onSave({ ema20: clamp(draft.ema20, 2, 500) });
    else if (target === "ema50") onSave({ ema50: clamp(draft.ema50, 2, 500) });
    else if (target === "ema200") onSave({ ema200: clamp(draft.ema200, 2, 500) });
    else if (target === "rsi") onSave({ rsi: clamp(draft.rsi, 2, 100) });
    else if (target === "macd")
      onSave({
        macdFast: clamp(draft.macdFast, 2, 100),
        macdSlow: clamp(draft.macdSlow, 2, 200),
        macdSignal: clamp(draft.macdSignal, 2, 100),
      });
    else if (target === "bb")
      onSave({
        bbPeriod: clamp(draft.bbPeriod, 2, 200),
        bbStdDev: clamp(draft.bbStdDev, 0.5, 5),
      });
    else if (target === "stoch")
      onSave({
        stochK: clamp(draft.stochK, 2, 100),
        stochD: clamp(draft.stochD, 2, 100),
        stochSmooth: clamp(draft.stochSmooth, 1, 50),
      });
    else if (target === "supertrend")
      onSave({
        stPeriod: clamp(draft.stPeriod, 2, 100),
        stMultiplier: clamp(draft.stMultiplier, 0.5, 10),
      });
    else if (target === "wavetrend")
      onSave({
        wtChannel: clamp(draft.wtChannel, 2, 100),
        wtAvg: clamp(draft.wtAvg, 2, 100),
        wtSignal: clamp(draft.wtSignal, 2, 50),
      });
    else if (target === "vwap" || target === "volume") onSave({});
  }

  // The ribbon has a variable number of lines and edits apply live, so it
  // manages its own state instead of the shared draft/Apply flow.
  if (target === "ribbon") return <RibbonEditor />;

  return (
    <div className="flex flex-col gap-3">
      {(target === "ema20" || target === "ema50" || target === "ema200") && (
        <Field
          label="Período"
          value={draft[target]}
          onChange={(n) => setDraft((d) => ({ ...d, [target]: n }))}
        />
      )}
      {target === "rsi" && (
        <Field
          label="Período"
          value={draft.rsi}
          onChange={(n) => setDraft((d) => ({ ...d, rsi: n }))}
        />
      )}
      {target === "macd" && (
        <div className="grid grid-cols-3 gap-2">
          <Field
            label="Rápida"
            value={draft.macdFast}
            onChange={(n) => setDraft((d) => ({ ...d, macdFast: n }))}
          />
          <Field
            label="Lenta"
            value={draft.macdSlow}
            onChange={(n) => setDraft((d) => ({ ...d, macdSlow: n }))}
          />
          <Field
            label="Señal"
            value={draft.macdSignal}
            onChange={(n) => setDraft((d) => ({ ...d, macdSignal: n }))}
          />
        </div>
      )}
      {target === "bb" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Período"
            value={draft.bbPeriod}
            onChange={(n) => setDraft((d) => ({ ...d, bbPeriod: n }))}
          />
          <Field
            label="Desv. Estándar"
            value={draft.bbStdDev}
            onChange={(n) => setDraft((d) => ({ ...d, bbStdDev: n }))}
          />
        </div>
      )}
      {target === "stoch" && (
        <div className="grid grid-cols-3 gap-2">
          <Field
            label="%K"
            value={draft.stochK}
            onChange={(n) => setDraft((d) => ({ ...d, stochK: n }))}
          />
          <Field
            label="%D"
            value={draft.stochD}
            onChange={(n) => setDraft((d) => ({ ...d, stochD: n }))}
          />
          <Field
            label="Suavizado"
            value={draft.stochSmooth}
            onChange={(n) => setDraft((d) => ({ ...d, stochSmooth: n }))}
          />
        </div>
      )}
      {target === "supertrend" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Período ATR"
            value={draft.stPeriod}
            onChange={(n) => setDraft((d) => ({ ...d, stPeriod: n }))}
          />
          <Field
            label="Multiplicador"
            value={draft.stMultiplier}
            onChange={(n) => setDraft((d) => ({ ...d, stMultiplier: n }))}
          />
        </div>
      )}
      {target === "wavetrend" && (
        <div className="grid grid-cols-3 gap-2">
          <Field
            label="Canal"
            value={draft.wtChannel}
            onChange={(n) => setDraft((d) => ({ ...d, wtChannel: n }))}
          />
          <Field
            label="Promedio"
            value={draft.wtAvg}
            onChange={(n) => setDraft((d) => ({ ...d, wtAvg: n }))}
          />
          <Field
            label="Señal"
            value={draft.wtSignal}
            onChange={(n) => setDraft((d) => ({ ...d, wtSignal: n }))}
          />
        </div>
      )}
      {target === "vwap" && (
        <p className="text-xs text-tv-text-muted">
          VWAP se calcula automáticamente y se resetea al inicio de cada día UTC.
        </p>
      )}
      {target === "volume" && (
        <p className="text-xs text-tv-text-muted">
          El indicador de volumen no tiene parámetros configurables en esta
          versión.
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-tv-text-muted hover:text-tv-text"
        >
          Reset defaults
        </Button>
        <Button size="sm" onClick={save} className="bg-tv-blue hover:bg-tv-blue/90">
          Aplicar
        </Button>
      </div>
    </div>
  );
}

function RibbonEditor() {
  const config = useChartStore((s) => s.config);
  const setConfig = useChartStore((s) => s.setConfig);
  const setRibbonLine = useChartStore((s) => s.setRibbonLine);
  const addRibbonLine = useChartStore((s) => s.addRibbonLine);
  const removeRibbonLine = useChartStore((s) => s.removeRibbonLine);
  const resetRibbon = useChartStore((s) => s.resetRibbon);
  const setTarget = useChartStore((s) => s.setSettingsTarget);

  const lines = config.ribbonLines;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          <span className="w-4" />
          <span>Período</span>
          <span>Color</span>
          <span>Grosor</span>
          <span className="w-6" />
        </div>

        {lines.map((line, i) => (
          <div
            key={i}
            className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2"
          >
            <button
              onClick={() => setRibbonLine(i, { enabled: !line.enabled })}
              title={line.enabled ? "Ocultar esta EMA" : "Mostrar esta EMA"}
              aria-label={line.enabled ? "Ocultar EMA" : "Mostrar EMA"}
              className="text-tv-text-muted hover:text-tv-text"
            >
              {line.enabled ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </button>

            <Input
              type="number"
              min={2}
              max={500}
              value={line.period}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n)) setRibbonLine(i, { period: clamp(n, 2, 500) });
              }}
              className={cn(
                "h-8 bg-tv-bg tabular-nums",
                !line.enabled && "opacity-50",
              )}
            />

            <input
              type="color"
              value={line.color}
              onChange={(e) => setRibbonLine(i, { color: e.target.value })}
              aria-label={`Color de la EMA ${line.period}`}
              className="h-8 w-8 cursor-pointer rounded border border-tv-border bg-tv-bg p-0.5"
            />

            <select
              value={line.width}
              onChange={(e) =>
                setRibbonLine(i, { width: parseInt(e.target.value, 10) })
              }
              aria-label={`Grosor de la EMA ${line.period}`}
              className="h-8 rounded border border-tv-border bg-tv-bg px-1.5 text-xs text-tv-text"
            >
              {[1, 2, 3, 4].map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>

            <button
              onClick={() => removeRibbonLine(i)}
              disabled={lines.length <= 1}
              title="Quitar esta EMA"
              aria-label="Quitar EMA"
              className="rounded p-1 text-tv-text-muted hover:bg-tv-bg hover:text-tv-red disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={addRibbonLine}
        disabled={lines.length >= MAX_RIBBON_LINES}
        className="justify-start gap-1.5 text-tv-text-muted hover:text-tv-text disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar EMA ({lines.length}/{MAX_RIBBON_LINES})
      </Button>

      <div className="flex flex-col gap-2 border-t border-tv-border pt-3">
        <label className="flex items-center gap-2 text-xs text-tv-text">
          <input
            type="checkbox"
            checked={config.ribbonFill}
            onChange={(e) => setConfig({ ribbonFill: e.target.checked })}
            className="h-3.5 w-3.5 accent-tv-blue"
          />
          Rellenar el área entre la EMA más rápida y la más lenta
        </label>

        {config.ribbonFill && (
          <label className="flex items-center gap-2 text-xs text-tv-text-muted">
            <span className="w-20 shrink-0">Opacidad</span>
            <input
              type="range"
              min={0}
              max={40}
              value={config.ribbonFillOpacity}
              onChange={(e) =>
                setConfig({ ribbonFillOpacity: parseInt(e.target.value, 10) })
              }
              className="flex-1 accent-tv-blue"
            />
            <span className="w-8 text-right tabular-nums">
              {config.ribbonFillOpacity}%
            </span>
          </label>
        )}
      </div>

      <p className="text-xs text-tv-text-muted">
        Precio sobre la cinta con las EMAs abiertas hacia arriba = sesgo alcista.
        Por debajo y apuntando abajo = bajista. EMAs enredadas = rango, mejor no
        forzar la entrada.
      </p>

      <div className="mt-1 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={resetRibbon}
          className="text-tv-text-muted hover:text-tv-text"
        >
          Reset cinta
        </Button>
        <Button
          size="sm"
          onClick={() => setTarget(null)}
          className="bg-tv-blue hover:bg-tv-blue/90"
        >
          Listo
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  swatch,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  swatch?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {swatch && (
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: swatch }}
          />
        )}
        {label}
      </span>
      <Input
        type="number"
        min={2}
        max={500}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(n);
        }}
        className="bg-tv-bg tabular-nums"
      />
    </label>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
