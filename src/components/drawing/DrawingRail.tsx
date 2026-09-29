"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import { ACTION_ICONS, DrawIcon, TOOL_ICONS } from "./icons";
import { TOOL_GROUPS, toolDef, type ToolId } from "./tools";
import { useDrawingEngine } from "./useDrawingEngine";
import type { MagnetMode } from "./engine";

const GROUPS_KEY = "trading-rail-groups";

const MAGNET_NEXT: Record<MagnetMode, MagnetMode> = { off: "weak", weak: "strong", strong: "off" };
const MAGNET_LABEL: Record<MagnetMode, string> = { off: "apagado", weak: "débil", strong: "fuerte" };

const title = (id: ToolId) => {
  const def = toolDef(id);
  return def.shortcut ? `${def.name} (${def.shortcut})` : def.name;
};

function readRemembered(): Record<string, ToolId> {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function RailButton({
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
        "draw-btn relative grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors",
        active ? "bg-tv-accent/15 text-tv-accent" : "text-tv-text hover:bg-tv-panel-hover",
        danger && "text-tv-red",
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-tv-accent" />}
      {children}
    </button>
  );
}

const Sep = () => <span className="my-1 h-px w-6 shrink-0 bg-tv-border" />;

/**
 * CdeCripto / TradingView drawing rail: seven tool groups (each remembers the
 * last tool picked from its flyout), then magnet, keep drawing, undo / redo,
 * lock, hide and delete everything.
 */
export function DrawingRail() {
  const { engine, state } = useDrawingEngine();
  const chartTool = useChartStore((s) => s.tool);
  const setChartTool = useChartStore((s) => s.setTool);
  const rulerOn = chartTool === "measure";
  const [current, setCurrent] = useState<Record<string, ToolId>>({});

  // Arming a drawing tool (rail, menu or Alt+ shortcut) puts the ruler away
  useEffect(() => {
    if (state.tool && useChartStore.getState().tool === "measure") setChartTool("cursor");
  }, [state.tool, setChartTool]);
  const [open, setOpen] = useState<{ group: string; top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Remembered picks load after mount (localStorage isn't there on the server)
  useEffect(() => {
    const saved = readRemembered();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrent(saved);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof PointerEvent && menuRef.current?.contains(e.target as Node)) return;
      setOpen(null);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const groupTool = (g: (typeof TOOL_GROUPS)[number]): ToolId => {
    // The armed tool shows on its group's button, else the last one picked
    if (state.tool && g.tools.includes(state.tool)) return state.tool;
    const saved = current[g.id];
    return saved && g.tools.includes(saved) ? saved : g.tools[0];
  };

  const pick = (groupId: string, id: ToolId) => {
    const next = { ...current, [groupId]: id };
    setCurrent(next);
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
    } catch {
      // optional
    }
    setOpen(null);
    engine?.setTool(id);
  };

  const openGroup = (groupId: string, el: HTMLElement) => {
    if (open?.group === groupId) {
      setOpen(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setOpen({ group: groupId, top: r.top, left: r.right + 6 });
  };

  const openGroupDef = open ? TOOL_GROUPS.find((g) => g.id === open.group) : null;

  return (
    <nav
      aria-label="Herramientas de dibujo"
      className="flex h-full w-[46px] flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden border-r border-tv-border bg-tv-panel py-1 [scrollbar-width:none]"
    >
      {TOOL_GROUPS.map((g) => {
        const id = groupTool(g);
        return (
          <div key={g.id} className="group/tg relative flex shrink-0 items-center">
            <RailButton
              label={title(id)}
              active={state.tool === id}
              onClick={() => engine?.setTool(state.tool === id ? null : id)}
            >
              <DrawIcon>{TOOL_ICONS[id]}</DrawIcon>
            </RailButton>
            <button
              type="button"
              title={`Más: ${g.name}`}
              aria-label={`Abrir ${g.name}`}
              aria-haspopup="menu"
              aria-expanded={open?.group === g.id}
              onClick={(e) => openGroup(g.id, e.currentTarget.parentElement!)}
              className="absolute -right-1.5 bottom-0.5 grid h-4 w-3 place-items-center rounded-sm text-tv-text-muted opacity-70 hover:bg-tv-panel-hover hover:opacity-100 group-hover/tg:opacity-100 aria-expanded:opacity-100"
            >
              <DrawIcon size={12}>{ACTION_ICONS.chevron}</DrawIcon>
            </button>
          </div>
        );
      })}

      <RailButton
        label="Regla: mide precio, %, barras y tiempo (Esc cancela)"
        active={rulerOn}
        onClick={() => {
          engine?.setTool(null);
          setChartTool(rulerOn ? "cursor" : "measure");
        }}
      >
        <DrawIcon>{ACTION_ICONS.ruler}</DrawIcon>
      </RailButton>

      <Sep />
      <RailButton
        label={`Imán: ${MAGNET_LABEL[state.magnet]}`}
        active={state.magnet !== "off"}
        danger={state.magnet === "strong"}
        onClick={() => engine?.setMagnet(MAGNET_NEXT[state.magnet])}
      >
        <DrawIcon>{ACTION_ICONS.magnet}</DrawIcon>
      </RailButton>
      <RailButton
        label="Seguir dibujando (mantener la herramienta activa)"
        active={state.keepDrawing}
        onClick={() => engine?.setKeepDrawing(!state.keepDrawing)}
      >
        <DrawIcon>{ACTION_ICONS.keep}</DrawIcon>
      </RailButton>
      <Sep />
      <RailButton label="Deshacer (Ctrl+Z)" onClick={() => engine?.undo()}>
        <DrawIcon>{ACTION_ICONS.undo}</DrawIcon>
      </RailButton>
      <RailButton label="Rehacer (Ctrl+Y)" onClick={() => engine?.redo()}>
        <DrawIcon>{ACTION_ICONS.redo}</DrawIcon>
      </RailButton>
      <Sep />
      <RailButton label="Bloquear o desbloquear todos" onClick={() => engine?.lockAll()}>
        <DrawIcon>{ACTION_ICONS.lock}</DrawIcon>
      </RailButton>
      <RailButton label="Ocultar o mostrar todos" onClick={() => engine?.hideAll()}>
        <DrawIcon>{ACTION_ICONS.eye}</DrawIcon>
      </RailButton>
      <RailButton label="Borrar todos (menos los bloqueados)" onClick={() => engine?.deleteAll()}>
        <DrawIcon>{ACTION_ICONS.trash}</DrawIcon>
      </RailButton>

      {open &&
        openGroupDef &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: Math.max(8, Math.min(open.top, window.innerHeight - 60 - openGroupDef.tools.length * 36)), left: open.left }}
            className="fixed z-[1400] max-h-[70vh] min-w-[250px] overflow-y-auto rounded-lg border border-tv-border-strong bg-tv-surface p-1.5 shadow-2xl"
          >
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] uppercase tracking-[0.06em] text-tv-text-muted">
              {openGroupDef.name}
            </div>
            {openGroupDef.tools.map((id) => {
              const def = toolDef(id);
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  onClick={() => pick(openGroupDef.id, id)}
                  className={cn(
                    "draw-btn grid w-full grid-cols-[22px_1fr_auto] items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left text-[13px] hover:bg-tv-panel-hover",
                    state.tool === id ? "text-tv-accent" : "text-tv-text",
                  )}
                >
                  <DrawIcon size={22}>{TOOL_ICONS[id]}</DrawIcon>
                  <span>{def.name}</span>
                  <kbd className="font-mono text-[11px] text-tv-text-muted">{def.shortcut ?? ""}</kbd>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </nav>
  );
}

/** Colours offered on a selected drawing. */
export const DRAWING_PALETTE = ["#2962ff", "#26a69a", "#ef4b5a", "#f59e0b", "#a855f7", "#e2e6ee"];

/**
 * Bar over the chart while a drawing is selected: colour, width, edit text,
 * lock, clone and delete.
 */
export function DrawingStyleBar() {
  const { engine, state } = useDrawingEngine();
  const d = state.selected;
  if (!engine || !d) return null;
  const editable = toolDef(d.tool).editable;
  return (
    <div
      role="toolbar"
      aria-label="Estilo del dibujo seleccionado"
      className="absolute left-1/2 top-2.5 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-tv-border bg-tv-panel px-1.5 py-1 shadow-2xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex gap-1 px-1">
        {DRAWING_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title="Color"
            aria-label={`Color ${c}`}
            onClick={() => engine.setColor(c)}
            className={cn(
              "h-[18px] w-[18px] rounded-full border-2 border-tv-panel outline outline-1",
              d.style.color === c ? "outline-tv-text" : "outline-tv-border",
            )}
            style={{ background: c }}
          />
        ))}
      </div>
      <select
        value={d.style.width}
        onChange={(e) => engine.setWidth(Number(e.target.value))}
        title="Grosor"
        aria-label="Grosor de línea"
        className="h-7 rounded-md border border-tv-border bg-tv-bg px-1.5 text-xs text-tv-text"
      >
        {[1, 2, 3, 4].map((w) => (
          <option key={w} value={w}>
            {w} px
          </option>
        ))}
      </select>
      {editable && (
        <BarButton label="Editar texto" onClick={() => engine.editSelectedText()}>
          <DrawIcon size={24}>{ACTION_ICONS.text}</DrawIcon>
        </BarButton>
      )}
      <BarButton label={d.locked ? "Desbloquear" : "Bloquear"} active={d.locked} onClick={() => engine.toggleLock()}>
        <DrawIcon size={24}>{d.locked ? ACTION_ICONS.lock : ACTION_ICONS.unlock}</DrawIcon>
      </BarButton>
      <BarButton label="Clonar" onClick={() => engine.clone()}>
        <DrawIcon size={24}>{ACTION_ICONS.clone}</DrawIcon>
      </BarButton>
      <BarButton label="Borrar (Supr)" onClick={() => engine.remove()}>
        <DrawIcon size={24}>{ACTION_ICONS.trash}</DrawIcon>
      </BarButton>
    </div>
  );
}

function BarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "draw-btn grid h-8 w-8 place-items-center rounded-md hover:bg-tv-panel-hover",
        active ? "text-tv-accent" : "text-tv-text",
      )}
    >
      {children}
    </button>
  );
}
