'use client';

import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';

/**
 * Link/button that opens a private blob via a short-lived signed URL.
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
  const { url: signed, loading, error, refresh } = useSignedMediaUrl(url);

  if (!url) return null;

  return (
    <button
      type="button"
      className={className}
      disabled={loading || !signed}
      title={error || name || 'Open'}
      onClick={() => {
        if (signed) {
          window.open(signed, '_blank', 'noopener,noreferrer');
        } else {
          refresh();
        }
      }}
    >
      {loading ? '…' : children}
    </button>
  );
}
