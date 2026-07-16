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
  MAX_VWAP_BANDS,
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
  ichimoku: "Ichimoku",
  session: "Sesión de Nueva York",
  stochrsi: "Estocástico RSI",
};

export function IndicatorSettingsDialog() {
  const target = useChartStore((s) => s.settingsTarget);
  const setTarget = useChartStore((s) => s.setSettingsTarget);
  const config = useChartStore((s) => s.config);
  const setConfig = useChartStore((s) => s.setConfig);

  // Conditionally mounted so it fully closes — base-ui's exit animation lingers
  // visible with this app's Tailwind setup, so we unmount on close instead.
  if (target === null) return null;

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) setTarget(null);
      }}
    >
      <DialogContent
        className={cn(
          "bg-tv-panel",
          target === "ribbon" || target === "vwap" ? "max-w-md" : "max-w-sm",
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
    else if (target === "rsi")
      onSave({
        rsi: clamp(draft.rsi, 2, 100),
        rsiDiv: draft.rsiDiv,
        rsiDivLeft: clamp(draft.rsiDivLeft, 1, 30),
        rsiDivRight: clamp(draft.rsiDivRight, 1, 30),
        rsiMa: draft.rsiMa,
        rsiMaPeriod: clamp(draft.rsiMaPeriod, 2, 100),
      });
    else if (target === "session")
      onSave({ sessionOffsetMin: clamp(draft.sessionOffsetMin, 5, 480) });
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
    else if (target === "stochrsi")
      onSave({
        srsiRsiLen: clamp(draft.srsiRsiLen, 2, 100),
        srsiStochLen: clamp(draft.srsiStochLen, 2, 100),
        srsiK: clamp(draft.srsiK, 1, 50),
        srsiD: clamp(draft.srsiD, 1, 50),
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
    else if (target === "ichimoku")
      onSave({
        ichiTenkan: clamp(draft.ichiTenkan, 2, 100),
        ichiKijun: clamp(draft.ichiKijun, 2, 200),
        ichiSenkouB: clamp(draft.ichiSenkouB, 2, 400),
        ichiDisplacement: clamp(draft.ichiDisplacement, 1, 100),
      });
    else if (target === "volume") onSave({});
  }

  // The ribbon and VWAP edit live (variable band counts, colors, fills), so they
  // manage their own state instead of the shared draft/Apply flow.
  if (target === "ribbon") return <RibbonEditor />;
  if (target === "vwap") return <VwapEditor />;

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
        <>
          <Field
            label="Período"
            value={draft.rsi}
            onChange={(n) => setDraft((d) => ({ ...d, rsi: n }))}
          />

          <div className="flex flex-col gap-2 border-t border-tv-border pt-3">
            <label className="flex items-center gap-2 text-xs text-tv-text">
              <input
                type="checkbox"
                checked={draft.rsiMa}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, rsiMa: e.target.checked }))
                }
                className="h-3.5 w-3.5 accent-tv-blue"
              />
              Media móvil del RSI (línea gris)
            </label>
            {draft.rsiMa && (
              <Field
                label="Período de la media"
                value={draft.rsiMaPeriod}
                onChange={(n) => setDraft((d) => ({ ...d, rsiMaPeriod: n }))}
              />
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-tv-border pt-3">
            <label className="flex items-center gap-2 text-xs text-tv-text">
              <input
                type="checkbox"
                checked={draft.rsiDiv}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, rsiDiv: e.target.checked }))
                }
                className="h-3.5 w-3.5 accent-tv-blue"
              />
              Marcar divergencias (bull / bear / hidden)
            </label>

            {draft.rsiDiv && (
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Pivote izq."
                  value={draft.rsiDivLeft}
                  onChange={(n) => setDraft((d) => ({ ...d, rsiDivLeft: n }))}
                />
                <Field
                  label="Pivote der."
                  value={draft.rsiDivRight}
                  onChange={(n) => setDraft((d) => ({ ...d, rsiDivRight: n }))}
                />
              </div>
            )}
          </div>

          <p className="text-xs text-tv-text-muted">
            Un pivote solo se confirma cuando pasan los bares de la derecha, así
            que la etiqueta aparece unas velas por detrás — igual que en
            TradingView. Divergencia regular = posible giro; oculta = probable
            continuación.
          </p>
        </>
      )}
      {target === "session" && (
        <>
          <Field
            label="Minutos antes / después de la apertura"
            value={draft.sessionOffsetMin}
            onChange={(n) => setDraft((d) => ({ ...d, sessionOffsetMin: n }))}
          />
          <p className="text-xs text-tv-text-muted">
            Marca la apertura de Nueva York (09:30 hora de NY, con horario de
            verano incluido) y las líneas de ±{draft.sessionOffsetMin} minutos.
            Solo se dibujan en temporalidades intradía.
          </p>
        </>
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
      {target === "stochrsi" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Longitud RSI"
              value={draft.srsiRsiLen}
              onChange={(n) => setDraft((d) => ({ ...d, srsiRsiLen: n }))}
            />
            <Field
              label="Longitud Estocástico"
              value={draft.srsiStochLen}
              onChange={(n) => setDraft((d) => ({ ...d, srsiStochLen: n }))}
            />
            <Field
              label="Suavizado %K"
              value={draft.srsiK}
              onChange={(n) => setDraft((d) => ({ ...d, srsiK: n }))}
            />
            <Field
              label="Suavizado %D"
              value={draft.srsiD}
              onChange={(n) => setDraft((d) => ({ ...d, srsiD: n }))}
            />
          </div>
          <p className="text-xs text-tv-text-muted">
            El estocástico aplicado sobre el RSI (14, 14, 3, 3 como en
            TradingView). Más rápido y extremo que el estocástico normal: bueno
            para cronometrar entradas dentro de la tendencia.
          </p>
        </>
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
      {target === "ichimoku" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Tenkan"
              value={draft.ichiTenkan}
              onChange={(n) => setDraft((d) => ({ ...d, ichiTenkan: n }))}
            />
            <Field
              label="Kijun"
              value={draft.ichiKijun}
              onChange={(n) => setDraft((d) => ({ ...d, ichiKijun: n }))}
            />
            <Field
              label="Senkou B"
              value={draft.ichiSenkouB}
              onChange={(n) => setDraft((d) => ({ ...d, ichiSenkouB: n }))}
            />
            <Field
              label="Desplazamiento"
              value={draft.ichiDisplacement}
              onChange={(n) => setDraft((d) => ({ ...d, ichiDisplacement: n }))}
            />
          </div>
          <p className="text-xs text-tv-text-muted">
            Precio sobre la nube = tendencia alcista; debajo = bajista; dentro =
            indecisión. La nube verde/roja proyecta soporte y resistencia a
            futuro.
          </p>
        </>
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

function VwapEditor() {
  const config = useChartStore((s) => s.config);
  const setConfig = useChartStore((s) => s.setConfig);
  const setVwapBand = useChartStore((s) => s.setVwapBand);
  const addVwapBand = useChartStore((s) => s.addVwapBand);
  const removeVwapBand = useChartStore((s) => s.removeVwapBand);
  const resetVwap = useChartStore((s) => s.resetVwap);
  const setTarget = useChartStore((s) => s.setSettingsTarget);

  const bands = config.vwapBandLines;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Color VWAP
          </span>
          <input
            type="color"
            value={config.vwapColor}
            onChange={(e) => setConfig({ vwapColor: e.target.value })}
            aria-label="Color de la línea VWAP"
            className="h-8 w-full cursor-pointer rounded border border-tv-border bg-tv-bg p-0.5"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Color relleno
          </span>
          <input
            type="color"
            value={config.vwapFillColor}
            onChange={(e) => setConfig({ vwapFillColor: e.target.value })}
            aria-label="Color del sombreado entre bandas"
            className="h-8 w-full cursor-pointer rounded border border-tv-border bg-tv-bg p-0.5"
          />
        </label>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-tv-border pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          Multiplicadores de bandas (desviación estándar)
        </span>

        {bands.length === 0 && (
          <p className="text-xs text-tv-text-muted">
            Sin bandas — solo se dibuja la línea VWAP.
          </p>
        )}

        {bands.map((band, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={band.enabled}
              onChange={(e) => setVwapBand(i, { enabled: e.target.checked })}
              aria-label={`Activar banda #${i + 1}`}
              className="h-3.5 w-3.5 accent-tv-blue"
            />
            <span className="w-20 shrink-0 text-xs text-tv-text">
              Banda #{i + 1}
            </span>
            <Input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={band.multiplier}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (!isNaN(n)) setVwapBand(i, { multiplier: clamp(n, 0.1, 10) });
              }}
              aria-label={`Multiplicador de la banda #${i + 1}`}
              className={cn(
                "h-8 flex-1 bg-tv-bg tabular-nums",
                !band.enabled && "opacity-50",
              )}
            />
            <input
              type="color"
              value={band.color}
              onChange={(e) => setVwapBand(i, { color: e.target.value })}
              aria-label={`Color de la banda #${i + 1}`}
              className="h-8 w-8 shrink-0 cursor-pointer rounded border border-tv-border bg-tv-bg p-0.5"
            />
            <button
              onClick={() => removeVwapBand(i)}
              title="Quitar esta banda"
              aria-label={`Quitar banda #${i + 1}`}
              className="rounded p-1 text-tv-text-muted hover:bg-tv-bg hover:text-tv-red"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <Button
          variant="ghost"
          size="sm"
          onClick={addVwapBand}
          disabled={bands.length >= MAX_VWAP_BANDS}
          className="justify-start gap-1.5 text-tv-text-muted hover:text-tv-text disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar banda ({bands.length}/{MAX_VWAP_BANDS})
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-tv-border pt-3">
        <label className="flex items-center gap-2 text-xs text-tv-text">
          <input
            type="checkbox"
            checked={config.vwapFill}
            onChange={(e) => setConfig({ vwapFill: e.target.checked })}
            className="h-3.5 w-3.5 accent-tv-blue"
          />
          Sombrear las bandas (cloud)
        </label>

        {config.vwapFill && (
          <label className="flex items-center gap-2 text-xs text-tv-text-muted">
            <span className="w-20 shrink-0">Opacidad</span>
            <input
              type="range"
              min={0}
              max={30}
              value={config.vwapFillOpacity}
              onChange={(e) =>
                setConfig({ vwapFillOpacity: parseInt(e.target.value, 10) })
              }
              className="flex-1 accent-tv-blue"
            />
            <span className="w-8 text-right tabular-nums">
              {config.vwapFillOpacity}%
            </span>
          </label>
        )}
      </div>

      <p className="text-xs text-tv-text-muted">
        El VWAP se resetea al inicio de cada día UTC. Cada banda se dibuja arriba
        y abajo a multiplicador × desviación estándar ponderada por volumen: con
        el multiplicador en 1 tienes la banda de 1σ, la que suele actuar de zona
        de retroceso; las externas marcan sobre-extensión.
      </p>

      <div className="mt-1 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={resetVwap}
          className="text-tv-text-muted hover:text-tv-text"
        >
          Reset VWAP
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
