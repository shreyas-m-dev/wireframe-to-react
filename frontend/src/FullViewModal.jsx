import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'button,[href],input,select,textarea,iframe,[tabindex]:not([tabindex="-1"])';

/** Full-screen dialog with focus trap, Escape to close and focus restore. */
export default function FullViewModal({ title, children, onClose }) {
  const dialogRef = useRef(null);
  const openerRef = useRef(document.activeElement);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keydown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    dialogRef.current?.querySelector('button')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
      openerRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 p-2 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fullview-title" className="mx-auto flex h-full max-w-[1600px] flex-col overflow-hidden rounded-xl border border-border bg-surface-1 shadow-2">
        <header className="glass flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id="fullview-title" className="text-title">{title}</h2>
          <button type="button" onClick={onClose} className="h-8 px-3 rounded-md border border-border-strong text-label hover:bg-surface-2">Close</button>
        </header>
        <div className="flex-1 overflow-auto scroll-thin p-4">{children}</div>
      </section>
    </div>
  );
}
