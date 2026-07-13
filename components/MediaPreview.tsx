'use client';

import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';

export default function MediaPreview({
  url,
  mime,
  name,
  className = 'h-14 w-14'
}: {
  url?: string | null;
  mime?: string | null;
  name?: string;
  className?: string;
}) {
  const { url: resolved, loading, error } = useSignedMediaUrl(url);

  const isImage =
    (mime || '').startsWith('image/') ||
    Boolean(url?.match(/\.(jpe?g|png|gif|webp|heic|avif)(\?|$)/i)) ||
    Boolean(resolved?.match(/\.(jpe?g|png|gif|webp|heic|avif)(\?|$)/i));
  const isVideo =
    (mime || '').startsWith('video/') ||
    Boolean(url?.match(/\.(mp4|mov|webm|avi|m4v)(\?|$)/i)) ||
    Boolean(resolved?.match(/\.(mp4|mov|webm|avi|m4v)(\?|$)/i));

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

  if (error && !resolved) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-[10px] text-red-300`}
        title={error}
      >
        !
      </div>
    );
  }

  if (resolved && isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt={name || ''}
        className={`${className} rounded-lg border border-surface-600 object-cover`}
      />
    );
  }

  if (resolved && isVideo) {
    return (
      <video
        src={resolved}
        className={`${className} rounded-lg border border-surface-600 object-cover`}
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  if (resolved) {
    return (
      <a
        href={resolved}
        target="_blank"
        rel="noreferrer"
        className={`${className} flex items-center justify-center rounded-lg border border-surface-600 bg-surface-950 text-lg hover:border-amber-400/40`}
        title={name || 'Open file'}
      >
        📄
      </a>
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
