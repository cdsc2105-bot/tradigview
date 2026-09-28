"use client";

import { MousePointer2, Minus, Ruler, Trash2, TrendingUp, Eraser } from "lucide-react";
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
  { key: "cursor", icon: MousePointer2, label: "Cursor", hint: "Modo navegación" },
  {
    key: "hline",
    icon: Minus,
    label: "Línea horizontal",
    hint: "Click en el chart para marcar un precio",
  },
  {
    key: "trend",
    icon: TrendingUp,
    label: "Línea de tendencia",
    hint: "Click en dos puntos para trazar la recta · Esc cancela",
  },
  {
    key: "measure",
    icon: Ruler,
    label: "Regla / Medir",
    hint: "Click en dos puntos para medir Δ precio, %, barras y volumen · Esc cancela",
  },
  {
    key: "eraser",
    icon: Eraser,
    label: "Goma de borrar",
    hint: "Click sobre una línea para borrar solo esa",
  },
];

export function LeftSidebar() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const clearPriceLines = useChartStore((s) => s.clearPriceLines);
  const symbol = useChartStore((s) => s.symbol);

  return (
    <aside className="flex w-[46px] flex-col items-center gap-1 border-r border-tv-border bg-tv-panel py-2">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = tool === t.key;
        return (
          <Tooltip key={t.key}>
            <TooltipTrigger
              onClick={() => setTool(t.key)}
              aria-label={t.label}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-tv-panel-hover",
                active
                  ? "bg-tv-accent/15 text-tv-accent"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              <div className="font-medium">{t.label}</div>
              {t.hint && (
                <div className="mt-0.5 text-[10px] text-tv-text-muted">{t.hint}</div>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}

      <Tooltip>
        <TooltipTrigger
          onClick={() => clearPriceLines(symbol)}
          aria-label="Borrar dibujos"
          className="flex h-9 w-9 items-center justify-center rounded-md text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
        >
          <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.6} />
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <div className="font-medium">Borrar todos los dibujos</div>
          <div className="mt-0.5 text-[10px] text-tv-text-muted">
            Limpia todas las líneas de este símbolo — para borrar una sola, usa
            la goma
          </div>
        </TooltipContent>
      </Tooltip>

    </aside>
  );
}
