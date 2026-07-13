'use client';

import { useState } from 'react';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';

export default function MediaPreview({
  url,
  mime,
  name,
  className = 'h-14 w-14',
  controls = false
}: {
  url?: string | null;
  mime?: string | null;
  name?: string;
  className?: string;
  /** Show video controls (preview modal) */
  controls?: boolean;
}) {
  const { url: resolved, loading, error, refresh } = useSignedMediaUrl(url, {
    filename: name || undefined
  });
  const [mediaError, setMediaError] = useState(false);

  const isImage =
    (mime || '').startsWith('image/') ||
    Boolean((url || resolved || '').match(/\.(jpe?g|png|gif|webp|heic|avif)(\?|$)/i));
  const isVideo =
    (mime || '').startsWith('video/') ||
    Boolean((url || resolved || '').match(/\.(mp4|mov|webm|avi|m4v)(\?|$)/i));

  if (loading && !resolved) {
    return (
      <div
        className={`${className} flex animate-pulse items-center justify-center rounded-lg border border-surface-600 bg-surface-950 text-[10px] text-ink-dim`}
        title="Loading secure preview…"
      >
        …
      </div>
    );
  }

  if ((error || mediaError) && !resolved) {
    return (
      <button
        type="button"
        className={`${className} flex flex-col items-center justify-center gap-0.5 rounded-lg border border-red-500/30 bg-red-500/10 text-[10px] text-red-300`}
        title={error || 'Preview failed'}
        onClick={() => {
          setMediaError(false);
          refresh();
        }}
      >
        <span>!</span>
        <span className="underline">Retry</span>
      </button>
    );
  }

  if (resolved && isImage && !mediaError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={name || ''}
        className={`${className} rounded-lg border border-surface-600 object-cover`}
        onError={() => {
          setMediaError(true);
          refresh();
        }}
      />
    );
  }

  if (resolved && isVideo && !mediaError) {
    return (
      <video
        src={resolved}
        className={`${className} rounded-lg border border-surface-600 object-cover`}
        muted={!controls}
        playsInline
        controls={controls}
        preload="metadata"
        onError={() => {
          setMediaError(true);
          refresh();
        }}
      />
    );
  }

  if (resolved) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-lg border border-surface-600 bg-surface-950 text-lg`}
        title={name || 'File'}
      >
        📄
      </div>
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center rounded-lg border border-surface-600 bg-surface-950 text-lg`}
    >
      {isVideo ? '▶' : isImage ? '🖼' : '📄'}
    </div>
  );
}
