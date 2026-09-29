"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type MenuOption =
  | "sep"
  | {
      label: string;
      action: () => void;
      /** Red text, for destructive actions */
      danger?: boolean;
      disabled?: boolean;
      /** Radio-style tick; undefined = plain item */
      checked?: boolean;
      /** Dim text on the right (a count, a hint) */
      detail?: string;
    };

interface OpenMenu {
  anchor: HTMLElement;
  options: MenuOption[];
  align: "left" | "right";
}

/**
 * Small popover menu anchored to a button, like the list / section menus in
 * CdeCripto's panel. Closes on outside press, Escape, or picking an option.
 * Opening it again from the same anchor toggles it shut.
 */
export function useMenu() {
  const [menu, setMenu] = useState<OpenMenu | null>(null);

  const open = useCallback(
    (anchor: HTMLElement, options: MenuOption[], align: "left" | "right" = "left") => {
      setMenu((m) => (m?.anchor === anchor ? null : { anchor, options, align }));
    },
    [],
  );
  const close = useCallback(() => setMenu(null), []);

  const element = menu ? <PopMenu {...menu} onClose={close} /> : null;
  return { open, close, element, isOpenFor: (a: HTMLElement | null) => !!a && menu?.anchor === a };
}

function PopMenu({ anchor, options, align, onClose }: OpenMenu & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Place it under the anchor, flipping above when it would run off-screen.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const r = anchor.getBoundingClientRect();
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const left = align === "right" ? r.right - w : r.left;
    const below = r.bottom + 4;
    // Written straight to the node: it's measured first, so it can't be a prop.
    node.style.left = `${Math.max(8, Math.min(left, window.innerWidth - w - 8))}px`;
    node.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below}px`;
    node.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [anchor, align]);

  useEffect(() => {
    anchor.setAttribute("aria-expanded", "true");
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
      anchor.focus();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      anchor.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: -9999, top: -9999 }}
      className="fixed z-[2100] max-h-[min(420px,calc(100vh-16px))] min-w-[210px] max-w-[300px] overflow-y-auto rounded-lg border border-tv-border bg-tv-panel p-1 shadow-2xl"
    >
      {options.map((op, i) =>
        op === "sep" ? (
          <div key={`sep${i}`} className="mx-1 my-1.5 h-px bg-tv-border" />
        ) : (
          <button
            key={op.label}
            type="button"
            role={op.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={op.checked === undefined ? undefined : op.checked}
            disabled={op.disabled}
            onClick={() => {
              onClose();
              op.action();
            }}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded px-1.5 pr-2.5 text-left text-xs outline-none",
              "hover:bg-tv-panel-hover focus-visible:bg-tv-panel-hover disabled:cursor-default disabled:bg-transparent disabled:text-tv-text-dim",
              op.danger ? "text-tv-red" : "text-tv-text",
            )}
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center">
              {op.checked && <Check className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{op.label}</span>
            {op.detail != null && (
              <span className="whitespace-nowrap text-[11px] text-tv-text-dim">{op.detail}</span>
            )}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** Centered card over a dimmed backdrop; backdrop click and Escape close it. */
export function Modal({
  onClose,
  children,
  className,
  label,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  // Latest handler in a ref: callers pass inline functions, and re-running the
  // effect on every render would bounce focus out of the dialog's input.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current();
      }}
      className="fixed inset-0 z-[2000] grid place-items-center bg-black/60 p-4"
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-xl border border-tv-border bg-tv-panel p-4 text-tv-text shadow-2xl",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

type Pending =
  | { kind: "text"; title: string; value: string; button: string; resolve: (v: string | null) => void }
  | { kind: "confirm"; title: string; text: string; button: string; resolve: (v: boolean) => void };

/**
 * Promise-style name prompt and confirmation, so a menu action can simply
 * `await prompt(...)` like CdeCripto's panel does.
 */
export function useDialogs() {
  const [pending, setPending] = useState<Pending | null>(null);

  const prompt = useCallback(
    (title: string, value = "", button = "Guardar") =>
      new Promise<string | null>((resolve) =>
        setPending({ kind: "text", title, value, button, resolve }),
      ),
    [],
  );
  const confirm = useCallback(
    (title: string, text: string, button: string) =>
      new Promise<boolean>((resolve) =>
        setPending({ kind: "confirm", title, text, button, resolve }),
      ),
    [],
  );

  let element: ReactNode = null;
  if (pending?.kind === "text") {
    element = (
      <TextPrompt
        {...pending}
        onDone={(v) => {
          pending.resolve(v);
          setPending(null);
        }}
      />
    );
  } else if (pending?.kind === "confirm") {
    const done = (v: boolean) => {
      pending.resolve(v);
      setPending(null);
    };
    element = (
      <Modal onClose={() => done(false)} label={pending.title}>
        <h3 className="mb-2 text-sm font-semibold">{pending.title}</h3>
        <p className="mb-4 text-xs text-tv-text-muted">{pending.text}</p>
        <div className="flex justify-end gap-2">
          <DialogButton autoFocus onClick={() => done(false)}>
            Cancelar
          </DialogButton>
          <DialogButton tone="danger" onClick={() => done(true)}>
            {pending.button}
          </DialogButton>
        </div>
      </Modal>
    );
  }
  return { prompt, confirm, element };
}

function TextPrompt({
  title,
  value,
  button,
  onDone,
}: {
  title: string;
  value: string;
  button: string;
  onDone: (v: string | null) => void;
}) {
  const [text, setText] = useState(value);
  return (
    <Modal onClose={() => onDone(null)} label={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onDone(text.trim());
        }}
      >
        <h3 className="mb-3 text-sm font-semibold">{title}</h3>
        <input
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={text}
          maxLength={40}
          spellCheck={false}
          autoComplete="off"
          aria-label={title}
          onChange={(e) => setText(e.target.value)}
          className="mb-4 h-9 w-full rounded-md border border-tv-border bg-tv-bg px-3 text-sm text-tv-text outline-none focus:border-tv-blue"
        />
        <div className="flex justify-end gap-2">
          <DialogButton onClick={() => onDone(null)}>Cancelar</DialogButton>
          <DialogButton type="submit" tone="primary" disabled={!text.trim()}>
            {button}
          </DialogButton>
        </div>
      </form>
    </Modal>
  );
}

function DialogButton({
  tone,
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "danger" }) {
  return (
    <button
      type={type}
      {...props}
      className={cn(
        "h-8 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-40",
        tone === "primary" && "bg-tv-blue text-white hover:bg-tv-blue/90",
        tone === "danger" && "bg-tv-red text-white hover:bg-tv-red/90",
        !tone && "border border-tv-border text-tv-text hover:bg-tv-panel-hover",
        className,
      )}
    />
  );
}
