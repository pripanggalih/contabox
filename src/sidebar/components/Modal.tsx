/**
 * Reusable modal shell.
 *
 * Renders into `document.body` via `createPortal` so the dialog escapes its
 * caller's DOM hierarchy (z-index correctness + isolation from drag/click
 * handlers on parent rows).
 *
 * React events still bubble through the component tree even with a portal,
 * so we explicitly stop propagation on the backdrop. That prevents events
 * fired inside the modal (clicks on inputs, button presses) from re-entering
 * an ancestor like ContainerRow's `onClick`/`useDraggable` listeners.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

export function Modal({ title, onClose, children, size = 'md' }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    // Capture so we beat any document-level listeners (drag managers, etc.).
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Lock background scroll while modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        // Backdrop dismiss only when click landed on backdrop itself.
        if (e.target === e.currentTarget) onClose();
        // Stop everything from re-entering ancestor handlers regardless.
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className={`w-full ${SIZE[size]} rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            ×
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
