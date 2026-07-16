'use client';

import { useState } from 'react';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';
import { useToast } from '@/components/ToastProvider';

/**
 * Link/button that opens a private blob via a short-lived signed URL
 * (or authenticated same-origin stream fallback).
 * Works for media/* and documents/* pathnames and full Blob URLs.
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
  const {
    url: signed,
    streamUrl,
    loading,
    error,
    refresh,
    ensureAccess
  } = useSignedMediaUrl(url, { filename: name });
  const { error: toastError } = useToast();
  const [opening, setOpening] = useState(false);

  if (!url) return null;

  async function handleOpen() {
    if (!url) return;
    setOpening(true);
    try {
      const access = await ensureAccess();
      // Prefer same-origin stream for PDFs/docs (Clerk cookies + reliable Content-Type).
      // Fall back to signed CDN URL when stream is unavailable.
      const href =
        access?.streamPreviewUrl ||
        access?.previewUrl ||
        streamUrl ||
        signed;

      if (!href) {
        throw new Error(
          error ||
            'Could not generate a signed URL for this file. Check Vercel Blob configuration or try again.'
        );
      }

      // Reject raw relative pathnames that would 404 on the app host
      if (
        !href.startsWith('/') &&
        !href.includes('://') &&
        !href.startsWith('blob:') &&
        !href.startsWith('data:')
      ) {
        throw new Error(
          'Invalid file link (unsigned pathname). Signed URL generation failed — try again or re-upload the PDF.'
        );
      }

      const win = window.open(href, '_blank', 'noopener,noreferrer');
      if (!win) {
        // Popup blocked — try navigating top-level as last resort for same-origin stream
        if (href.startsWith('/')) {
          window.location.href = href;
        } else {
          throw new Error('Popup blocked. Allow popups for this site to view the document.');
        }
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not open file. Signed URL generation failed.';
      toastError('Could not open document', message);
      refresh();
    } finally {
      setOpening(false);
    }
  }

  const disabled = loading || opening;

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={error || name || 'Open'}
      onClick={() => void handleOpen()}
    >
      {opening || loading ? 'Opening…' : children}
    </button>
  );
}
