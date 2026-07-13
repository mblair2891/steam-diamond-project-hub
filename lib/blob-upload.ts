/**
 * Client helper: upload a file to our server API, which stores it with
 * official @vercel/blob `put()` on the server.
 *
 * Uses XMLHttpRequest so we get real transfer progress, then only reports
 * success after the server returns a confirmed Blob URL.
 */

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
  /** Folder prefix: media | blitz | uploads */
  folder?: string;
  /**
   * Progress 0–100.
   * 0–90 = bytes sent to our API; 90–99 = server saving to Blob; 100 = confirmed.
   */
  onProgress?: (pct: number) => void;
  onPhase?: (phase: UploadPhase) => void;
  abortSignal?: AbortSignal;
}

export const BLOB_MAX_BYTES = 100 * 1024 * 1024;

const UPLOAD_URL = '/api/media/upload';

function parseErrorBody(text: string, status: number): string {
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    if (data.error) return data.error;
    if (data.message) return data.message;
  } catch {
    /* not JSON */
  }
  if (status === 401) return 'Unauthorized. Please sign in again.';
  if (status === 403) return 'Editors and admins only.';
  if (status === 413) return 'File too large for the server.';
  if (status === 503) return 'Vercel Blob is not configured on this deployment.';
  if (status >= 500) return `Server error (${status}). Please try again.`;
  if (text?.trim()) return text.trim().slice(0, 280);
  return `Upload failed (${status}).`;
}

/**
 * POST file to /api/media/upload (server-side @vercel/blob put).
 * Resolves only when the server returns a valid public URL.
 */
export function uploadToBlob(options: BlobUploadOptions): Promise<BlobUploadResult> {
  const { file, folder = 'media', onProgress, onPhase, abortSignal } = options;

  if (!file || file.size === 0) {
    return Promise.reject(new Error('File is empty or missing.'));
  }
  if (file.size > BLOB_MAX_BYTES) {
    return Promise.reject(new Error(`${file.name} is too large (max 100MB).`));
  }

  return new Promise<BlobUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      onPhase?.('error');
      reject(new Error(message));
    };

    const succeed = (result: BlobUploadResult) => {
      if (settled) return;
      settled = true;
      onProgress?.(100);
      onPhase?.('complete');
      resolve(result);
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        fail('Upload cancelled.');
        return;
      }
      abortSignal.addEventListener(
        'abort',
        () => {
          xhr.abort();
          fail('Upload cancelled.');
        },
        { once: true }
      );
    }

    xhr.open('POST', UPLOAD_URL);
    // Clerk session cookie is same-origin; include credentials explicitly
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        onPhase?.('uploading');
        return;
      }
      onPhase?.('uploading');
      // Reserve 90–99% for server-side Blob put + response
      const transferPct = Math.round((event.loaded / event.total) * 90);
      onProgress?.(Math.max(1, Math.min(90, transferPct)));
    };

    xhr.upload.onload = () => {
      // All bytes left the browser — server is still putting to Vercel Blob
      onPhase?.('processing');
      onProgress?.(92);
    };

    xhr.onerror = () => {
      fail('Network error while uploading. Check your connection and try again.');
    };

    xhr.ontimeout = () => {
      fail('Upload timed out. Try a smaller file or check your connection.');
    };

    xhr.onabort = () => {
      fail('Upload cancelled.');
    };

    xhr.onload = () => {
      onPhase?.('processing');
      onProgress?.(96);

      const status = xhr.status;
      const text = xhr.responseText || '';

      if (status < 200 || status >= 300) {
        fail(parseErrorBody(text, status));
        return;
      }

      let data: {
        ok?: boolean;
        url?: string;
        pathname?: string;
        contentType?: string;
        size?: number;
        name?: string;
        downloadUrl?: string;
        error?: string;
      };

      try {
        data = JSON.parse(text);
      } catch {
        fail('Invalid response from upload server. Please try again.');
        return;
      }

      if (data.error) {
        fail(data.error);
        return;
      }

      if (!data.url || typeof data.url !== 'string') {
        fail('Upload finished but no file URL was returned. Please try again.');
        return;
      }

      // Only now do we mark complete — Blob put succeeded server-side
      succeed({
        url: data.url,
        pathname: data.pathname || '',
        contentType: data.contentType || file.type || 'application/octet-stream',
        size: typeof data.size === 'number' ? data.size : file.size,
        name: data.name || file.name,
        downloadUrl: data.downloadUrl || data.url
      });
    };

    // 10 minutes — covers large video + server put
    xhr.timeout = 10 * 60 * 1000;

    const form = new FormData();
    form.append('file', file, file.name);
    form.append('folder', folder);

    onPhase?.('uploading');
    onProgress?.(1);
    xhr.send(form);
  });
}
