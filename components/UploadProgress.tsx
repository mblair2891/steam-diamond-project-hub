'use client';

import type { UploadPhase } from '@/lib/blob-upload';

const PHASE_LABEL: Record<UploadPhase, string> = {
  queued: 'Queued…',
  uploading: 'Uploading…',
  processing: 'Processing…',
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
  onDismiss
}: {
  label?: string;
  progress: number;
  previewUrl?: string | null;
  mime?: string | null;
  phase?: UploadPhase;
  error?: string;
  onDismiss?: () => void;
}) {
  const pct =
    phase === 'complete'
      ? 100
      : phase === 'error'
        ? 0
        : phase === 'processing'
          ? Math.max(progress, 96)
          : Math.max(0, Math.min(99, Math.round(progress)));

  const isImage = (mime || '').startsWith('image/');
  const isVideo = (mime || '').startsWith('video/');
  const barColor =
    phase === 'complete'
      ? 'bg-emerald-400'
      : phase === 'error'
        ? 'bg-red-400'
        : phase === 'processing'
          ? 'bg-sky-400'
          : 'bg-amber-400';

  const statusText =
    phase === 'error'
      ? error || PHASE_LABEL.error
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
                      : 'text-amber-300'
              }`}
            >
              {statusText}
            </div>
          </div>
          {onDismiss && (phase === 'complete' || phase === 'error') && (
            <button type="button" className="btn-ghost btn-sm shrink-0" onClick={onDismiss}>
              ✕
            </button>
          )}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-600">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor} ${
              phase === 'uploading' || phase === 'processing' ? 'animate-pulse' : ''
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-dim">
          <span>
            {phase === 'complete' ? '100%' : phase === 'error' ? '—' : `${pct}%`}
          </span>
          {phase === 'processing' && <span>Saving to cloud…</span>}
        </div>
        {phase === 'error' && error && (
          <p className="mt-1 text-[11px] leading-snug text-red-300/90">{error}</p>
        )}
      </div>
    </div>
  );
}
