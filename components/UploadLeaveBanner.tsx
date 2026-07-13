'use client';

import { useUploadManager } from '@/components/UploadManager';

/**
 * Sticky warning when uploads are active — survives in-app navigation.
 * Browser tab close/refresh is handled separately via beforeunload.
 */
export default function UploadLeaveBanner() {
  const { activeCount, hasActiveUploads, jobs } = useUploadManager();

  if (!hasActiveUploads) return null;

  const names = jobs
    .filter(
      (j) =>
        j.phase === 'queued' ||
        j.phase === 'uploading' ||
        j.phase === 'processing' ||
        j.phase === 'retrying'
    )
    .map((j) => j.name)
    .slice(0, 2);

  const label =
    names.length === 0
      ? `${activeCount} upload${activeCount === 1 ? '' : 's'} in progress`
      : names.length === 1
        ? `Uploading “${names[0]}”`
        : `Uploading ${activeCount} files (incl. “${names[0]}”)`;

  return (
    <div
      className="sticky top-0 z-[45] border-b border-amber-400/40 bg-amber-400/15 px-3 py-2.5 text-sm text-amber-100 backdrop-blur-md sm:px-5"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
        <strong className="font-semibold text-amber-200">Stay on this site</strong>
        <span className="text-amber-100/90">
          {label}. You can switch pages inside the hub — progress stays in the panel below —
          but <span className="font-semibold">do not close or refresh the tab</span> until
          uploads finish.
        </span>
      </div>
    </div>
  );
}
