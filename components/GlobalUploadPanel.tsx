'use client';

import Link from 'next/link';
import UploadProgress from '@/components/UploadProgress';
import { useUploadManager } from '@/components/UploadManager';

/**
 * Sticky panel so uploads remain visible while navigating between pages.
 */
export default function GlobalUploadPanel() {
  const { jobs, activeCount, dismissJob, clearFinished } = useUploadManager();

  if (jobs.length === 0) return null;

  const finished = jobs.filter((j) => j.phase === 'complete' || j.phase === 'error');

  return (
    <div className="fixed bottom-4 left-4 z-[90] w-[min(100vw-2rem,22rem)] space-y-2">
      <div className="panel overflow-hidden shadow-panel">
        <div className="flex items-center justify-between border-b border-surface-600 px-3 py-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-ink">
              Media uploads
            </div>
            <div className="text-[11px] text-ink-dim">
              {activeCount > 0
                ? `${activeCount} in progress — safe to navigate`
                : `${finished.length} finished`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {finished.length > 0 && (
              <button type="button" className="btn-ghost btn-sm" onClick={clearFinished}>
                Clear
              </button>
            )}
            <Link href="/media" className="btn-ghost btn-sm">
              Library
            </Link>
          </div>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto p-2 scrollbar-thin">
          {jobs.map((j) => (
            <UploadProgress
              key={j.id}
              label={j.name}
              progress={j.progress}
              previewUrl={j.previewUrl}
              mime={j.mime}
              phase={j.phase}
              error={j.error}
              onDismiss={() => dismissJob(j.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
