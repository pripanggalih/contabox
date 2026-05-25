import { useContaboxStore } from '../state/store';

export function ToastHost() {
  const toasts = useContaboxStore((s) => s.toasts);
  const dismiss = useContaboxStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-3 left-1/2 z-50 flex w-[92%] max-w-sm -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            'pointer-events-auto flex items-center gap-3 rounded-md border px-3 py-2 text-sm shadow-md',
            t.variant === 'error'
              ? 'border-[var(--color-danger)] bg-[var(--color-bg-elevated)] text-[var(--color-danger)]'
              : t.variant === 'success'
                ? 'border-[var(--color-success)] bg-[var(--color-bg-elevated)] text-[var(--color-success)]'
                : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]',
          ].join(' ')}
        >
          <span className="flex-1">{t.message}</span>
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
              className="font-medium text-[var(--color-accent)] hover:underline"
            >
              {t.action.label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
