"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Only render as a sheet below this breakpoint (e.g. the tasks panel is inline on desktop). */
  className?: string;
}

/**
 * Modal built on <dialog>, which gives focus trapping, Escape-to-close and
 * an accessible modal role for free. Bottom sheet on phones, centred above.
 */
export function Sheet({ open, title, onClose, children, className = "" }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === e.currentTarget) onClose();
      }}
      className={`sheet bg-paper p-0 text-ink shadow-2xl ${className}`}
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-tomato"
            aria-label="Close"
          >
            <CloseIcon className="text-xl" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
          {children}
        </div>
      </div>
    </dialog>
  );
}
