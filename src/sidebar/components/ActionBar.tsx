import { ExternalLink, Plus, Zap } from 'lucide-react';
import { useState } from 'react';
import { BulkCreateDialog } from './BulkCreateDialog';
import { BulkOpenUrlDialog } from './BulkOpenUrlDialog';
import { CreateContainerDialog } from './CreateContainerDialog';

export function ActionBar() {
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showBulkOpen, setShowBulkOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 border-b border-[var(--color-border)] px-2 py-2">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New
        </button>
        <button
          type="button"
          onClick={() => setShowBulk(true)}
          className="flex items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-xs hover:bg-[var(--color-bg-hover)]"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          Bulk
        </button>
        <button
          type="button"
          onClick={() => setShowBulkOpen(true)}
          className="flex items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1.5 text-xs hover:bg-[var(--color-bg-hover)]"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Open URL
        </button>
      </div>
      {showCreate ? <CreateContainerDialog onClose={() => setShowCreate(false)} /> : null}
      {showBulk ? <BulkCreateDialog onClose={() => setShowBulk(false)} /> : null}
      {showBulkOpen ? <BulkOpenUrlDialog onClose={() => setShowBulkOpen(false)} /> : null}
    </>
  );
}
