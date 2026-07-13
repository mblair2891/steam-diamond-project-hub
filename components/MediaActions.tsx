'use client';

import { useState } from 'react';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';
import { useToast } from '@/components/ToastProvider';

/**
 * Preview / Download / Delete controls for a private media file.
 */
export default function MediaActions({
  fileUrl,
  name,
  mime,
  canDelete,
  onPreview,
  onDeleted
}: {
  fileUrl?: string | null;
  name?: string;
  mime?: string;
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
      const href = access?.downloadUrl;
      if (!href) throw new Error('Could not create download link.');

      // Same-origin stream or signed URL — trigger download
      const a = document.createElement('a');
      a.href = href;
      a.download = name || 'download';
      a.rel = 'noopener';
      a.target = href.startsWith('/') ? '_self' : '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
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
      const res = await fetch('/api/media/delete', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: fileUrl })
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
    <div className="flex flex-wrap items-center gap-1">
      {onPreview && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={disabled}
          onClick={() => onPreview()}
        >
          Preview
        </button>
      )}
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={disabled || !fileUrl}
        onClick={() => void handleDownload()}
      >
        {busy === 'download' ? '…' : 'Download'}
      </button>
      {canDelete && (
        <button
          type="button"
          className="btn-danger"
          disabled={disabled}
          onClick={() => void handleDelete()}
        >
          {busy === 'delete' ? '…' : 'Delete'}
        </button>
      )}
    </div>
  );
}
