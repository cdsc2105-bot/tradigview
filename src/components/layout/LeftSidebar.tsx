"use client";

import {
  ArrowUpRight,
  Eraser,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Magnet,
  Minus,
  MousePointer2,
  RectangleHorizontal,
  Redo2,
  Rows3,
  Ruler,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface ToolDef {
  key: DrawingTool;
  icon: typeof MousePointer2;
  label: string;
  hint?: string;
}

export const TOOLS: ToolDef[] = [
  { key: "cursor", icon: MousePointer2, label: "Cursor", hint: "Mover el gráfico y los dibujos" },
  {
    key: "trend",
    icon: TrendingUp,
    label: "Línea de tendencia",
    hint: "Click en dos puntos · Esc cancela",
  },
  {
    key: "ray",
    icon: ArrowUpRight,
    label: "Rayo",
    hint: "Línea que sigue hacia la derecha desde dos puntos",
  },
  {
    key: "hline",
    icon: Minus,
    label: "Línea horizontal",
    hint: "Click en el gráfico para marcar un precio",
  },
  {
    key: "fib",
    icon: Rows3,
    label: "Retroceso de Fibonacci",
    hint: "Click en el inicio y el final del movimiento",
  },
  {
    key: "rect",
    icon: RectangleHorizontal,
    label: "Rectángulo",
    hint: "Click en dos esquinas opuestas",
  },
  { key: "text", icon: Type, label: "Texto", hint: "Click donde quieras la nota y escribe" },
  {
    key: "measure",
    icon: Ruler,
    label: "Regla / Medir",
    hint: "Mide Δ precio, %, barras y tiempo · Esc cancela",
  },
  {
    key: "eraser",
    icon: Eraser,
    label: "Goma de borrar",
    hint: "Click sobre un dibujo para borrar solo ese",
  },
];

function RailButton({
  label,
  hint,
  active,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-tv-panel-hover disabled:pointer-events-none disabled:opacity-30",
          active
            ? "bg-tv-accent/15 text-tv-accent"
            : danger
              ? "text-tv-text-muted hover:text-tv-red"
              : "text-tv-text-muted hover:text-tv-text",
        )}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[10px] text-tv-text-muted">{hint}</div>}
      </TooltipContent>
    </Tooltip>
  );
}

const ICON = { className: "h-[18px] w-[18px]", strokeWidth: 1.6 } as const;

/** Drawing tools, then drawing controls (magnet, lock, hide, undo…). */
export function LeftSidebar() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const clearPriceLines = useChartStore((s) => s.clearPriceLines);
  const symbol = useChartStore((s) => s.symbol);
  const magnet = useChartStore((s) => s.magnet);
  const setMagnet = useChartStore((s) => s.setMagnet);
  const locked = useChartStore((s) => s.drawingsLocked);
  const setLocked = useChartStore((s) => s.setDrawingsLocked);
  const hidden = useChartStore((s) => s.drawingsHidden);
  const setHidden = useChartStore((s) => s.setDrawingsHidden);
  const canUndo = useChartStore((s) => s.undoStack.length > 0);
  const canRedo = useChartStore((s) => s.redoStack.length > 0);
  const undo = useChartStore((s) => s.undoDrawing);
  const redo = useChartStore((s) => s.redoDrawing);

  return (
    <aside className="flex w-[46px] flex-col items-center gap-0.5 overflow-y-auto border-r border-tv-border bg-tv-panel py-2 scrollbar-none">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        return (
          <RailButton
            key={t.key}
            label={t.label}
            hint={t.hint}
            active={tool === t.key}
            onClick={() => setTool(t.key)}
          >
            <Icon {...ICON} />
          </RailButton>
        );
      })}

      <div className="my-1.5 h-px w-6 shrink-0 bg-tv-border" />

      <RailButton
        label={magnet ? "Imán activado" : "Imán"}
        hint="Pega los puntos al máximo, mínimo, apertura o cierre de la vela"
        active={magnet}
        onClick={() => setMagnet(!magnet)}
      >
        <Magnet {...ICON} />
      </RailButton>
      <RailButton
        label={locked ? "Desbloquear dibujos" : "Bloquear dibujos"}
        hint="Evita moverlos o borrarlos sin querer"
        active={locked}
        onClick={() => setLocked(!locked)}
      >
        {locked ? <Lock {...ICON} /> : <LockOpen {...ICON} />}
      </RailButton>
      <RailButton
        label={hidden ? "Mostrar dibujos" : "Ocultar dibujos"}
        active={hidden}
        onClick={() => setHidden(!hidden)}
      >
        {hidden ? <EyeOff {...ICON} /> : <Eye {...ICON} />}
      </RailButton>

      <div className="my-1.5 h-px w-6 shrink-0 bg-tv-border" />

      <RailButton label="Deshacer" hint="Ctrl + Z" disabled={!canUndo} onClick={undo}>
        <Undo2 {...ICON} />
      </RailButton>
      <RailButton label="Rehacer" hint="Ctrl + Y" disabled={!canRedo} onClick={redo}>
        <Redo2 {...ICON} />
      </RailButton>
      <RailButton
        label="Borrar todos los dibujos"
        hint="De este símbolo — para uno solo usa la goma. Se puede deshacer."
        danger
        onClick={() => clearPriceLines(symbol)}
      >
        <Trash2 {...ICON} />
      </RailButton>
    </aside>
  );
}
