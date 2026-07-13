/**
 * Client-side upload to Vercel Blob with reliable completion,
 * progress phases, multipart for large files, and clear errors.
 */

import { put } from '@vercel/blob/client';

export type UploadPhase =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error';

export interface BlobUploadResult {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  name: string;
  downloadUrl?: string;
}

export interface BlobUploadOptions {
  file: File;
  /** Folder prefix inside the blob store */
  folder?: string;
  /**
   * Progress 0–100.
   * Transfer is reported up to ~95; 96–99 is processing; 100 is complete.
   */
  onProgress?: (pct: number) => void;
  /** High-level phase for UI copy */
  onPhase?: (phase: UploadPhase) => void;
  abortSignal?: AbortSignal;
}

const MULTIPART_THRESHOLD = 4 * 1024 * 1024; // 4MB
const MAX_BYTES = 100 * 1024 * 1024;

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

/** Infer MIME when the browser leaves file.type empty (common on some OS/browsers). */
export function inferContentType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = extOf(file.name);
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return map[ext] || file.type || 'application/octet-stream';
}

function handleUploadUrl(): string {
  if (typeof window === 'undefined') return '/api/blob/upload';
  return `${window.location.origin}/api/blob/upload`;
}

async function requestClientToken(pathname: string, multipart: boolean, contentType: string) {
  const res = await fetch(handleUploadUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: {
        pathname,
        multipart,
        clientPayload: JSON.stringify({ contentType, ts: Date.now() })
      }
    }),
    credentials: 'same-origin'
  });

  let data: { clientToken?: string; error?: string; message?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok || !data.clientToken) {
    const msg =
      data.error ||
      data.message ||
      (res.status === 503
        ? 'Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN on Vercel.'
        : res.status === 401 || res.status === 403
          ? 'You must be signed in as an editor or admin to upload.'
          : `Could not start upload (${res.status}). Check Blob configuration and try again.`);
    throw new Error(msg);
  }

  return data.clientToken;
}

/**
 * Upload a file to Vercel Blob.
 * Uses a client token from our API + `put()` so we surface real errors,
 * enable multipart for large files, and drive clear UI phases.
 */
export async function uploadToBlob(options: BlobUploadOptions): Promise<BlobUploadResult> {
  const { file, folder = 'media', onProgress, onPhase, abortSignal } = options;

  if (!file || file.size === 0) {
    throw new Error('File is empty or missing.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`${file.name} is too large (max 100MB).`);
  }

  const contentType = inferContentType(file);
  const pathname = `${folder}/${Date.now()}-${safeName(file.name)}`;
  const multipart = file.size >= MULTIPART_THRESHOLD;

  onPhase?.('uploading');
  onProgress?.(1);

  // 1) Token from our route (clear errors if misconfigured / unauthorized)
  const token = await requestClientToken(pathname, multipart, contentType);
  if (abortSignal?.aborted) throw new Error('Upload cancelled.');

  onProgress?.(3);

  // 2) Upload bytes to Blob storage
  try {
    const blob = await put(pathname, file, {
      access: 'public',
      token,
      contentType,
      multipart,
      abortSignal,
      onUploadProgress: (event) => {
        if (!onProgress) return;
        const raw =
          typeof event.percentage === 'number'
            ? event.percentage
            : event.total
              ? (event.loaded / event.total) * 100
              : 0;
        // Keep headroom for the processing phase so UI never "sticks" at 99 forever
        const mapped = Math.min(95, Math.max(3, Math.round(raw * 0.95)));
        onProgress(mapped);
      }
    });

    // 3) Finalize
    onPhase?.('processing');
    onProgress?.(98);

    if (!blob?.url) {
      throw new Error('Upload finished but no file URL was returned. Please try again.');
    }

    onProgress?.(100);
    onPhase?.('complete');

    return {
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType || contentType,
      size: file.size,
      name: file.name,
      downloadUrl: blob.downloadUrl
    };
  } catch (err) {
    onPhase?.('error');
    if (err instanceof Error) {
      // Normalize opaque SDK messages
      const m = err.message || '';
      if (/Failed to\s+retrieve the client token/i.test(m)) {
        throw new Error(
          'Could not authorize upload with Vercel Blob. Verify BLOB_READ_WRITE_TOKEN on the deployment.'
        );
      }
      if (/abort/i.test(m)) {
        throw new Error('Upload cancelled.');
      }
      throw err;
    }
    throw new Error('Upload failed. Please try again.');
  }
}

export { MAX_BYTES as BLOB_MAX_BYTES };
