"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface PopoverPanelProps {
  /** Element the panel hangs from */
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Horizontal edge of the anchor the panel lines up with */
  align?: "start" | "end";
  /** Open upwards (for bars at the bottom of the screen) */
  side?: "bottom" | "top";
  className?: string;
}

/**
 * Lightweight dropdown panel rendered in a portal with fixed positioning, so it
 * escapes the header's horizontal scroller (which would otherwise clip it).
 * Closes on outside click, Escape, resize and scroll.
 */
export function PopoverPanel({
  anchor,
  open,
  onClose,
  children,
  align = "start",
  side = "bottom",
  className,
}: PopoverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor || !panelRef.current) return;
    const a = anchor.getBoundingClientRect();
    const p = panelRef.current.getBoundingClientRect();
    const margin = 8;
    let left = align === "start" ? a.left : a.right - p.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - p.width - margin));
    const top = side === "bottom" ? a.bottom + 6 : a.top - p.height - 6;
    setPos({ left, top: Math.max(margin, top) });
  }, [open, anchor, align, side]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onResize = () => onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, anchor, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className={cn(
        "fixed z-50 max-h-[80vh] overflow-y-auto rounded-[10px] border border-tv-border-strong bg-tv-surface p-1.5 shadow-2xl shadow-black/50",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Uppercase, letter-spaced group heading inside a popover. */
export function PopoverHeading({ children }: { children: ReactNode }) {
  return (
    <div className="select-none px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-tv-text-dim">
      {children}
    </div>
  );
}

/** Plain selectable row inside a popover. */
export function PopoverItem({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
        active
          ? "bg-tv-panel-hover text-tv-text"
          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
        className,
      )}
    >
      {children}
    </button>
  );
}
