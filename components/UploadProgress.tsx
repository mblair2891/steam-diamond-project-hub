'use client';

import type { UploadPhase } from '@/lib/blob-upload';

const PHASE_LABEL: Record<UploadPhase, string> = {
  queued: 'Queued…',
  uploading: 'Uploading…',
  processing: 'Saving to cloud…',
  retrying: 'Retrying…',
  complete: 'Uploaded successfully',
  error: 'Upload failed'
};

export default function UploadProgress({
  label,
  progress,
  previewUrl,
  mime,
  phase = 'uploading',
  error,
  attempt,
  maxAttempts,
  canRetry,
  onRetry,
  onDismiss
}: {
  label?: string;
  progress: number;
  previewUrl?: string | null;
  mime?: string | null;
  phase?: UploadPhase;
  error?: string;
  attempt?: number;
  maxAttempts?: number;
  canRetry?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const pct =
    phase === 'complete'
      ? 100
      : phase === 'error'
        ? 0
        : phase === 'processing'
          ? Math.max(92, Math.min(99, Math.round(progress || 92)))
          : phase === 'retrying'
            ? Math.max(2, Math.min(15, Math.round(progress || 2)))
            : Math.max(0, Math.min(90, Math.round(progress)));

  const isImage = (mime || '').startsWith('image/');
  const isVideo = (mime || '').startsWith('video/');
  const barColor =
    phase === 'complete'
      ? 'bg-emerald-400'
      : phase === 'error'
        ? 'bg-red-400'
        : phase === 'processing'
          ? 'bg-sky-400'
          : phase === 'retrying'
            ? 'bg-amber-300'
            : 'bg-amber-400';

  const statusText =
    phase === 'error'
      ? error || PHASE_LABEL.error
      : phase === 'retrying' && attempt && maxAttempts
        ? `Retrying (${attempt}/${maxAttempts})…`
        : PHASE_LABEL[phase] || PHASE_LABEL.uploading;

  return (
    <div
      className={`panel-inset flex gap-3 p-3 ${
        phase === 'complete'
          ? 'border-emerald-500/30'
          : phase === 'error'
            ? 'border-red-500/30'
            : ''
      }`}
    >
      {previewUrl && isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded-lg border border-surface-600 object-cover"
        />
      ) : previewUrl && isVideo ? (
        <video
          src={previewUrl}
          className="h-16 w-16 shrink-0 rounded-lg border border-surface-600 object-cover"
          muted
          playsInline
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-surface-600 bg-surface-950 text-lg">
          {isVideo ? '▶' : isImage ? '🖼' : '📄'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{label || 'Upload'}</div>
            <div
              className={`mt-0.5 text-[11px] font-semibold ${
                phase === 'complete'
                  ? 'text-emerald-300'
                  : phase === 'error'
                    ? 'text-red-300'
                    : phase === 'processing'
                      ? 'text-sky-300'
                      : phase === 'retrying'
                        ? 'text-amber-200'
                        : 'text-amber-300'
              }`}
            >
              {statusText}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {phase === 'error' && canRetry && onRetry && (
              <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
                Retry
              </button>
            )}
            {onDismiss && (phase === 'complete' || phase === 'error') && (
              <button type="button" className="btn-ghost btn-sm" onClick={onDismiss}>
                ✕
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-600">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor} ${
              phase === 'uploading' || phase === 'processing' || phase === 'retrying'
                ? 'animate-pulse'
                : ''
            }`}
            style={{ width: `${phase === 'error' ? 0 : pct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-dim">
          <span>
            {phase === 'complete' ? '100%' : phase === 'error' ? '—' : `${pct}%`}
            {attempt && maxAttempts && phase !== 'complete' && phase !== 'error'
              ? ` · try ${attempt}/${maxAttempts}`
              : ''}
          </span>
          {phase === 'processing' && <span>Writing to Vercel Blob…</span>}
          {phase === 'uploading' && <span>Sending to server…</span>}
          {phase === 'retrying' && <span>Automatic retry…</span>}
        </div>
        {phase === 'error' && error && (
          <p className="mt-1 text-[11px] leading-snug text-red-300/90">{error}</p>
        )}
      </div>
    </div>
  );
}
