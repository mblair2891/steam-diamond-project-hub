/**
 * Client-side upload to Vercel Blob with progress callbacks.
 */

import { upload } from '@vercel/blob/client';

export interface BlobUploadResult {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  name: string;
}

export interface BlobUploadOptions {
  file: File;
  /** Folder prefix inside the blob store */
  folder?: string;
  onProgress?: (pct: number) => void;
  /** AbortSignal if supported by the runtime */
  abortSignal?: AbortSignal;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export async function uploadToBlob(options: BlobUploadOptions): Promise<BlobUploadResult> {
  const { file, folder = 'media', onProgress } = options;
  const pathname = `${folder}/${Date.now()}-${safeName(file.name)}`;

  const blob = await upload(pathname, file, {
    access: 'public',
    handleUploadUrl: '/api/blob/upload',
    contentType: file.type || undefined,
    onUploadProgress: (event) => {
      if (!onProgress) return;
      if (typeof event.percentage === 'number') {
        onProgress(Math.round(event.percentage));
      } else if (event.total && event.loaded) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    }
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType || file.type || 'application/octet-stream',
    size: file.size,
    name: file.name
  };
}
