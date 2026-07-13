'use client';

import { useState } from 'react';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';
import { useToast } from '@/components/ToastProvider';

/**
 * Preview / Download / Delete controls for a private media file.
 * Uses temporary signed URLs (with authenticated stream fallback).
 */
export default function MediaActions({
  fileUrl,
  name,
  mime,
  canDelete = true,
  onPreview,
  onDeleted
}: {
  fileUrl?: string | null;
  name?: string;
  mime?: string;
  /** Any signed-in user may delete by default */
  canDelete?: boolean;
  onPreview?: () => void;
  onDeleted?: () => void;
}) {
  const { ensureAccess, loading } = useSignedMediaUrl(fileUrl, { filename: name });
  const { success, error: toastError } = useToast();
  const [busy, setBusy] = useState<'download' | 'delete' | null>(null);

  if (!fileUrl && !name) return null;

  async function handleDownload() {
    if (!fileUrl) return;
    setBusy('download');
    try {
      const access = await ensureAccess();
      // Prefer same-origin stream for downloads (cookies + Content-Disposition)
      // then signed download URL. Never use raw private hosts.
      const href =
        access?.streamDownloadUrl ||
        access?.downloadUrl ||
        access?.previewUrl;
      if (!href) throw new Error('Could not create download link.');

      if (href.startsWith('/')) {
        // Same-origin: navigate so Content-Disposition: attachment applies
        const a = document.createElement('a');
        a.href = href;
        a.download = name || 'download';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        // Signed CDN URL — open in new tab with download param
        const a = document.createElement('a');
        a.href = href;
        a.download = name || 'download';
        a.rel = 'noopener';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      success('Download started', name || 'File');
    } catch (err) {
      toastError(
        'Download failed',
        err instanceof Error ? err.message : 'Could not download file'
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!fileUrl || !canDelete) return;
    if (
      !confirm(
        `Delete “${name || 'this file'}” permanently from cloud storage and the library?`
      )
    ) {
      return;
    }
    setBusy('delete');
    try {
      const body: { url?: string; pathname?: string } = {};
      if (fileUrl.includes('://') || fileUrl.startsWith('/api/media/')) {
        body.url = fileUrl;
      } else {
        body.pathname = fileUrl;
      }

      const res = await fetch('/api/media/delete', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) {
        throw new Error(data.error || `Delete failed (${res.status})`);
      }
      onDeleted?.();
      success('File deleted', name || 'Media removed from Blob and library');
    } catch (err) {
      toastError('Delete failed', err instanceof Error ? err.message : 'Could not delete');
    } finally {
      setBusy(null);
    }
  }

  const disabled = loading || busy !== null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {onPreview && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={disabled}
          onClick={() => onPreview()}
          title={mime ? `Preview (${mime})` : 'Preview'}
        >
          Preview
        </button>
      )}
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={disabled || !fileUrl}
        onClick={() => void handleDownload()}
        title="Download file"
      >
        {busy === 'download' ? 'Downloading…' : 'Download'}
      </button>
      {canDelete && (
        <button
          type="button"
          className="btn-danger btn-sm"
          disabled={disabled || !fileUrl}
          onClick={() => void handleDelete()}
          title="Delete permanently"
        >
          {busy === 'delete' ? 'Deleting…' : 'Delete'}
        </button>
      )}
    </div>
  );
}
