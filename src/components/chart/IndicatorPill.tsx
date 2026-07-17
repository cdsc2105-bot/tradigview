"use client";

import { Eye, EyeOff, Maximize2, Minimize2, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  value?: string;
  color: string;
  hidden: boolean;
  onToggleHide: () => void;
  onSettings: () => void;
  onRemove: () => void;
  /** Pane indicators only: toggle making this pane the big one */
  onMaximize?: () => void;
  maximized?: boolean;
}

export function IndicatorPill({
  name,
  value,
  color,
  hidden,
  onToggleHide,
  onSettings,
  onRemove,
  onMaximize,
  maximized,
}: Props) {
  return (
    <div
      className={cn(
        "group/pill pointer-events-auto flex items-center gap-1.5 rounded bg-tv-panel/95 px-1.5 py-0.5 text-[11px] shadow-sm ring-1 ring-tv-border backdrop-blur",
        hidden && "opacity-50",
      )}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="font-medium text-tv-text">{name}</span>
      {value !== undefined && (
        <span className="tabular-nums text-tv-text-muted">{value}</span>
      )}
      <div className="ml-1 flex items-center gap-0.5">
        {onMaximize && (
          <button
            onClick={onMaximize}
            title={maximized ? "Restaurar tamaño (o doble-click en el panel)" : "Ampliar panel (o doble-click en el panel)"}
            aria-label={maximized ? "Restaurar tamaño" : "Ampliar panel"}
            className={cn(
              "rounded p-0.5 transition-colors hover:bg-tv-panel-hover",
              maximized
                ? "text-tv-blue hover:text-tv-blue"
                : "text-tv-text-dim hover:text-tv-text",
            )}
          >
            {maximized ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
          </button>
        )}
        <button
          onClick={onToggleHide}
          title={hidden ? "Mostrar" : "Ocultar"}
          aria-label={hidden ? "Mostrar" : "Ocultar"}
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
        >
          {hidden ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </button>
        <button
          onClick={onSettings}
          title="Configurar"
          aria-label="Configurar"
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Settings className="h-3 w-3" />
        </button>
        <button
          onClick={onRemove}
          title="Eliminar"
          aria-label="Eliminar"
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-red"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
