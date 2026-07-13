'use client';

import { useEffect, useState } from 'react';
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
  const {
    url: resolved,
    streamUrl,
    loading,
    error,
    refresh,
    useStreamFallback
  } = useSignedMediaUrl(url, {
    filename: name || undefined
  });
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [triedStream, setTriedStream] = useState(false);

  // Sync resolved → display; reset when source changes
  useEffect(() => {
    setDisplayUrl(resolved);
    setTriedStream(false);
  }, [resolved, url]);

  const isImage =
    (mime || '').startsWith('image/') ||
    Boolean((url || resolved || '').match(/\.(jpe?g|png|gif|webp|heic|avif)(\?|$)/i));
  const isVideo =
    (mime || '').startsWith('video/') ||
    Boolean((url || resolved || '').match(/\.(mp4|mov|webm|avi|m4v)(\?|$)/i));

  function handleMediaError() {
    // Signed CDN URL failed (e.g. Forbidden) → same-origin stream
    if (!triedStream && streamUrl && displayUrl !== streamUrl) {
      setTriedStream(true);
      useStreamFallback();
      setDisplayUrl(streamUrl);
      return;
    }
    // Last resort: re-mint signed + stream URLs
    setTriedStream(false);
    refresh();
  }

  if (loading && !displayUrl && !resolved) {
    return (
      <div
        className={`${className} flex animate-pulse items-center justify-center rounded-lg border border-surface-600 bg-surface-950 text-[10px] text-ink-dim`}
        title="Loading secure preview…"
      >
        …
      </div>
    );
  }

  const src = displayUrl || resolved;

  if (error && !src) {
    return (
      <button
        type="button"
        className={`${className} flex flex-col items-center justify-center gap-0.5 rounded-lg border border-red-500/30 bg-red-500/10 text-[10px] text-red-300`}
        title={error || 'Preview failed'}
        onClick={() => {
          setTriedStream(false);
          refresh();
        }}
      >
        <span>!</span>
        <span className="underline">Retry</span>
      </button>
    );
  }

  if (src && isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || ''}
        className={`${className} rounded-lg border border-surface-600 object-cover`}
        onError={handleMediaError}
      />
    );
  }

  if (src && isVideo) {
    return (
      <video
        key={src}
        src={src}
        className={`${className} rounded-lg border border-surface-600 object-cover`}
        muted={!controls}
        playsInline
        controls={controls}
        preload="metadata"
        onError={handleMediaError}
      />
    );
  }

  if (src) {
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
