/**
 * Client helper: upload a file to our server API, which stores it with
 * official @vercel/blob `put()` on the server.
 *
 * Uses XMLHttpRequest for real transfer progress. Only resolves after the
 * server returns a confirmed Blob URL. Supports automatic retries for
 * transient network / 5xx failures.
 */

export type UploadPhase =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'retrying'
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
  /** Fired before each attempt (1-based). */
  onAttempt?: (attempt: number, maxAttempts: number) => void;
  abortSignal?: AbortSignal;
  /** Total attempts including the first (default 3). */
  maxAttempts?: number;
}

export const BLOB_MAX_BYTES = 100 * 1024 * 1024;
export const UPLOAD_MAX_ATTEMPTS = 3;

const UPLOAD_URL = '/api/media/upload';

function parseErrorBody(text: string, status: number): string {
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    if (data.error) return data.error;
    if (data.message) return data.message;
  } catch {
    /* not JSON */
  }
  if (status === 0) return 'Network error. Check your connection and try again.';
  if (status === 401) return 'Unauthorized. Please sign in again.';
  if (status === 403) return 'Editors and admins only.';
  if (status === 413) return 'File too large for the server.';
  if (status === 503) return 'Vercel Blob is not configured on this deployment.';
  if (status >= 500) return `Server error (${status}). Will retry if possible.`;
  if (text?.trim()) return text.trim().slice(0, 280);
  return `Upload failed (${status}).`;
}

/** Errors that are safe / useful to retry automatically. */
export function isRetryableUploadError(status: number, message: string): boolean {
  if (status === 0 || status === 408 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (status === 401 || status === 403 || status === 400 || status === 413 || status === 415) {
    return false;
  }
  return /network|timeout|timed out|ECONNRESET|fetch failed|502|503|504|temporarily|try again/i.test(
    message
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Single XHR attempt to POST /api/media/upload.
 */
function uploadOnce(
  file: File,
  folder: string,
  onProgress?: (pct: number) => void,
  onPhase?: (phase: UploadPhase) => void,
  abortSignal?: AbortSignal
): Promise<BlobUploadResult> {
  return new Promise<BlobUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const fail = (message: string, status = 0) => {
      if (settled) return;
      settled = true;
      const err = new Error(message) as Error & { status?: number; retryable?: boolean };
      err.status = status;
      err.retryable = isRetryableUploadError(status, message);
      reject(err);
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
        fail('Upload cancelled.', 0);
        return;
      }
      abortSignal.addEventListener(
        'abort',
        () => {
          xhr.abort();
          fail('Upload cancelled.', 0);
        },
        { once: true }
      );
    }

    xhr.open('POST', UPLOAD_URL);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        onPhase?.('uploading');
        return;
      }
      onPhase?.('uploading');
      const transferPct = Math.round((event.loaded / event.total) * 90);
      onProgress?.(Math.max(1, Math.min(90, transferPct)));
    };

    xhr.upload.onload = () => {
      onPhase?.('processing');
      onProgress?.(92);
    };

    xhr.onerror = () => {
      fail('Network error while uploading. Check your connection and try again.', 0);
    };

    xhr.ontimeout = () => {
      fail('Upload timed out. Try a smaller file or check your connection.', 408);
    };

    xhr.onabort = () => {
      fail('Upload cancelled.', 0);
    };

    xhr.onload = () => {
      onPhase?.('processing');
      onProgress?.(96);

      const status = xhr.status;
      const text = xhr.responseText || '';

      if (status < 200 || status >= 300) {
        fail(parseErrorBody(text, status), status);
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
        fail('Invalid response from upload server. Please try again.', 502);
        return;
      }

      if (data.error) {
        fail(data.error, status);
        return;
      }

      if (!data.url || typeof data.url !== 'string') {
        fail('Upload finished but no file URL was returned. Please try again.', 502);
        return;
      }

      succeed({
        url: data.url,
        pathname: data.pathname || '',
        contentType: data.contentType || file.type || 'application/octet-stream',
        size: typeof data.size === 'number' ? data.size : file.size,
        name: data.name || file.name,
        downloadUrl: data.downloadUrl || data.url
      });
    };

    xhr.timeout = 10 * 60 * 1000;

    const form = new FormData();
    form.append('file', file, file.name);
    form.append('folder', folder);

    onPhase?.('uploading');
    onProgress?.(1);
    xhr.send(form);
  });
}

/**
 * POST file to /api/media/upload (server-side @vercel/blob put).
 * Retries transient failures with exponential backoff.
 * Resolves only when the server returns a valid public URL.
 */
export async function uploadToBlob(options: BlobUploadOptions): Promise<BlobUploadResult> {
  const {
    file,
    folder = 'media',
    onProgress,
    onPhase,
    onAttempt,
    abortSignal,
    maxAttempts = UPLOAD_MAX_ATTEMPTS
  } = options;

  if (!file || file.size === 0) {
    throw new Error('File is empty or missing.');
  }
  if (file.size > BLOB_MAX_BYTES) {
    throw new Error(`${file.name} is too large (max 100MB).`);
  }

  const attempts = Math.max(1, Math.min(5, maxAttempts));
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (abortSignal?.aborted) {
      throw new Error('Upload cancelled.');
    }

    onAttempt?.(attempt, attempts);

    if (attempt > 1) {
      onPhase?.('retrying');
      onProgress?.(2);
      // Backoff: 1s, 2s, 4s…
      await sleep(Math.min(8000, 1000 * 2 ** (attempt - 2)));
      if (abortSignal?.aborted) {
        throw new Error('Upload cancelled.');
      }
    }

    try {
      return await uploadOnce(file, folder, onProgress, onPhase, abortSignal);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const status = (lastError as Error & { status?: number }).status ?? 0;
      const retryable =
        (lastError as Error & { retryable?: boolean }).retryable ??
        isRetryableUploadError(status, lastError.message);

      if (!retryable || attempt >= attempts) {
        onPhase?.('error');
        throw lastError;
      }
      // Continue to next attempt
    }
  }

  onPhase?.('error');
  throw lastError || new Error('Upload failed.');
}
