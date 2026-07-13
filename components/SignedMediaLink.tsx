'use client';

import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';

/**
 * Link/button that opens a private blob via a short-lived signed URL
 * (or authenticated stream fallback).
 */
export default function SignedMediaLink({
  url,
  name,
  className = 'btn-ghost btn-sm',
  children = 'Open'
}: {
  url?: string | null;
  name?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { url: signed, streamUrl, loading, error, refresh, useStreamFallback } =
    useSignedMediaUrl(url);

  if (!url) return null;

  return (
    <button
      type="button"
      className={className}
      disabled={loading || (!signed && !streamUrl)}
      title={error || name || 'Open'}
      onClick={() => {
        const href = signed || streamUrl;
        if (href) {
          // Prefer same-origin stream in new tab if signed is cross-origin and fails
          window.open(href, '_blank', 'noopener,noreferrer');
        } else {
          useStreamFallback();
          refresh();
        }
      }}
    >
      {loading ? '…' : children}
    </button>
  );
}
