'use client';

import { useState } from 'react';
import Link from 'next/link';
import UploadProgress from '@/components/UploadProgress';
import { useUploadManager } from '@/components/UploadManager';

/**
 * Sticky panel so uploads remain visible while navigating between pages.
 */
export default function GlobalUploadPanel() {
  const { jobs, activeCount, dismissJob, clearFinished, retryJob } = useUploadManager();
  const [minimized, setMinimized] = useState(false);

  if (jobs.length === 0) return null;

  const finished = jobs.filter((j) => j.phase === 'complete' || j.phase === 'error');

  return (
    <div className="fixed bottom-4 left-4 z-[90] w-[min(100vw-2rem,22rem)] space-y-2">
      <div className="panel overflow-hidden shadow-panel">
        <div className="flex items-center justify-between border-b border-surface-600 px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-ink">
              Media uploads
            </div>
            <div className="text-[11px] text-ink-dim">
              {activeCount > 0
                ? `${activeCount} in progress · panel stays open on page change`
                : `${finished.length} finished`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setMinimized((v) => !v)}
              aria-label={minimized ? 'Expand uploads' : 'Minimize uploads'}
            >
              {minimized ? '▴' : '▾'}
            </button>
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
        {!minimized && (
          <div className="max-h-80 space-y-2 overflow-y-auto p-2 scrollbar-thin">
            {jobs.map((j) => (
              <UploadProgress
                key={j.id}
                label={j.name}
                progress={j.progress}
                previewUrl={j.previewUrl}
                mime={j.mime}
                phase={j.phase}
                error={j.error}
                attempt={j.attempt}
                maxAttempts={j.maxAttempts}
                canRetry={j.canRetry && j.phase === 'error'}
                onRetry={() => retryJob(j.id)}
                onDismiss={() => dismissJob(j.id)}
              />
            ))}
          </div>
        )}
        {minimized && activeCount > 0 && (
          <div className="px-3 py-2 text-[11px] text-amber-200">
            {activeCount} active · click ▴ to expand
          </div>
        )}
      </div>
    </div>
  );
}
