'use client';

export default function UploadProgress({
  label,
  progress,
  previewUrl,
  mime
}: {
  label?: string;
  progress: number;
  previewUrl?: string | null;
  mime?: string | null;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const isImage = (mime || '').startsWith('image/');
  const isVideo = (mime || '').startsWith('video/');

  return (
    <div className="panel-inset flex gap-3 p-3">
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
        <div className="truncate text-sm font-medium">{label || 'Uploading…'}</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-600">
          <div
            className="h-full rounded-full bg-amber-400 transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-[11px] text-ink-dim">{pct}%</div>
      </div>
    </div>
  );
}
