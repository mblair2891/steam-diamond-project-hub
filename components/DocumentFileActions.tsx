'use client';

import { useState } from 'react';
import SignedMediaLink from '@/components/SignedMediaLink';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';
import { useToast } from '@/components/ToastProvider';

/**
 * Open / Download / Delete controls for a private document PDF in Blob.
 * Uses the same signed-URL + stream pipeline as Media Library.
 */
export default function DocumentFileActions({
  fileRef,
  name,
  canEdit = false,
  openLabel = 'Open PDF',
  onDeleted
}: {
  /** pathname or full Blob URL */
  fileRef?: string | null;
  name?: string | null;
  /** Editors/admins can delete the blob */
  canEdit?: boolean;
  openLabel?: string;
  /** Called after blob delete succeeds so caller can clear local metadata */
  onDeleted?: () => void;
}) {
  const { ensureAccess, loading, error } = useSignedMediaUrl(fileRef, {
    filename: name || undefined
  });
  const { success, error: toastError } = useToast();
  const [busy, setBusy] = useState<'download' | 'delete' | null>(null);

  if (!fileRef) return null;

  async function handleDownload() {
    if (!fileRef) return;
    setBusy('download');
    try {
      const access = await ensureAccess();
      const href =
        access?.streamDownloadUrl ||
        access?.downloadUrl ||
        access?.streamPreviewUrl ||
        access?.previewUrl;

      if (!href) {
        throw new Error(
          error ||
            'Could not generate a signed download URL. Check Blob config or try again.'
        );
      }

      if (
        !href.startsWith('/') &&
        !href.includes('://') &&
        !href.startsWith('blob:') &&
        !href.startsWith('data:')
      ) {
        throw new Error(
          'Invalid download link (unsigned pathname). Try again or re-upload the PDF.'
        );
      }

      const a = document.createElement('a');
      a.href = href;
      a.download = name || 'document.pdf';
      a.rel = 'noopener';
      if (!href.startsWith('/')) a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
      success('Download started', name || 'PDF');
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
    if (!fileRef || !canEdit) return;
    if (
      !confirm(
        `Permanently delete “${name || 'this PDF'}” from cloud storage? You can upload a new file afterward.`
      )
    ) {
      return;
    }
    setBusy('delete');
    try {
      const body: { url?: string; pathname?: string } = {};
      if (fileRef.includes('://') || fileRef.startsWith('/api/media/')) {
        body.url = fileRef;
      } else {
        body.pathname = fileRef;
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
      success('File deleted', name || 'PDF removed from cloud storage');
    } catch (err) {
      toastError(
        'Delete failed',
        err instanceof Error ? err.message : 'Could not delete file'
      );
    } finally {
      setBusy(null);
    }
  }

  const disabled = loading || busy !== null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SignedMediaLink
        url={fileRef}
        name={name || undefined}
        className="btn-secondary btn-sm"
      >
        {openLabel}
      </SignedMediaLink>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={disabled}
        onClick={() => void handleDownload()}
        title="Download PDF"
      >
        {busy === 'download' ? 'Downloading…' : 'Download'}
      </button>
      {canEdit && (
        <button
          type="button"
          className="btn-danger btn-sm"
          disabled={disabled}
          onClick={() => void handleDelete()}
          title="Delete PDF from cloud storage"
        >
          {busy === 'delete' ? 'Deleting…' : 'Delete file'}
        </button>
      )}
    </div>
  );
}
