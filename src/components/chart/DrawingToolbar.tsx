"use client";

import { useState } from "react";
import { Copy, Lock, LockOpen, Pencil, Trash2 } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/** Colors offered for drawings, the app blue first (the default). */
export const DRAWING_COLORS = ["#2962ff", "#26a69a", "#ef5350", "#f59e0b", "#7e57c2", "#e2e6ee"];

export interface DrawingSelection {
  kind: "shape" | "hline";
  id: string;
}

/**
 * Floating bar for the selected drawing: color, line width, lock, duplicate,
 * delete (also the Delete key) and, for notes, edit the text.
 */
export function DrawingToolbar({
  selection,
  onSelect,
}: {
  selection: DrawingSelection;
  /** Called with the new selection (a clone) or null (deleted) */
  onSelect: (s: DrawingSelection | null) => void;
}) {
  const shape = useChartStore((s) =>
    selection.kind === "shape" ? s.trendLines.find((t) => t.id === selection.id) : undefined,
  );
  const line = useChartStore((s) =>
    selection.kind === "hline" ? s.priceLines.find((p) => p.id === selection.id) : undefined,
  );
  const updateTrendLine = useChartStore((s) => s.updateTrendLine);
  const updatePriceLine = useChartStore((s) => s.updatePriceLine);
  const removeTrendLine = useChartStore((s) => s.removeTrendLine);
  const removePriceLine = useChartStore((s) => s.removePriceLine);
  const cloneDrawing = useChartStore((s) => s.cloneDrawing);
  const [editingText, setEditingText] = useState(false);

  const item = shape ?? line;
  if (!item) return null;
  const isText = shape?.kind === "text";
  const update = (patch: { color?: string; width?: number; locked?: boolean; text?: string }) =>
    selection.kind === "shape" ? updateTrendLine(item.id, patch) : updatePriceLine(item.id, patch);
  const color = item.color ?? DRAWING_COLORS[0];
  const width = item.width ?? (selection.kind === "hline" ? 1 : shape?.kind === "rect" || shape?.kind === "fib" ? 1 : 2);

  return (
    <div
      role="toolbar"
      aria-label="Editar dibujo"
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-tv-border-strong bg-tv-surface/95 px-2 py-1.5 shadow-xl backdrop-blur"
    >
      {DRAWING_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={`Color ${c}`}
          aria-label={`Color ${c}`}
          aria-pressed={c === color}
          onClick={() => update({ color: c })}
          className={cn(
            "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
            c === color ? "border-white" : "border-transparent",
          )}
          style={{ backgroundColor: c }}
        />
      ))}

      {!isText && (
        <select
          aria-label="Grosor"
          value={width}
          onChange={(e) => update({ width: Number(e.target.value) })}
          className="ml-1 h-7 rounded-md border border-tv-border bg-tv-panel px-1.5 text-xs text-tv-text outline-none"
        >
          {[1, 2, 3, 4].map((w) => (
            <option key={w} value={w}>
              {w} px
            </option>
          ))}
        </select>
      )}

      <div className="mx-1 h-5 w-px bg-tv-border" />

      {isText &&
        (editingText ? (
          <input
            autoFocus
            defaultValue={shape?.text}
            aria-label="Texto de la nota"
            className="h-7 w-40 rounded-md border border-tv-blue bg-tv-panel px-2 text-xs text-tv-text outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const text = e.currentTarget.value.trim();
                if (text) update({ text });
                setEditingText(false);
              } else if (e.key === "Escape") {
                setEditingText(false);
              }
            }}
            onBlur={() => setEditingText(false)}
          />
        ) : (
          <ToolbarButton label="Editar texto" onClick={() => setEditingText(true)}>
            <Pencil className="h-4 w-4" />
          </ToolbarButton>
        ))}
      <ToolbarButton
        label={item.locked ? "Desbloquear" : "Bloquear"}
        active={item.locked}
        onClick={() => update({ locked: !item.locked })}
      >
        {item.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
      </ToolbarButton>
      <ToolbarButton
        label="Duplicar"
        onClick={() => {
          const id = cloneDrawing(selection.kind, item.id);
          if (id) onSelect({ kind: selection.kind, id });
        }}
      >
        <Copy className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Borrar (Supr)"
        danger
        onClick={() => {
          if (selection.kind === "shape") removeTrendLine(item.id);
          else removePriceLine(item.id);
          onSelect(null);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  danger,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 transition-colors hover:bg-tv-panel-hover",
        active ? "text-tv-accent" : danger ? "text-tv-text-muted hover:text-tv-red" : "text-tv-text-muted hover:text-tv-text",
      )}
    >
      {children}
    </button>
  );
}
