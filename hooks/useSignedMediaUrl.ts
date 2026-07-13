'use client';

import { useCallback, useEffect, useState } from 'react';

export type MediaAccessUrls = {
  /** For <img>/<video> preview */
  previewUrl: string;
  /** Force download */
  downloadUrl: string;
  /** Same-origin stream (always available for private blobs) */
  streamPreviewUrl?: string;
  streamDownloadUrl?: string;
  expiresAt: number;
  fallback?: boolean;
};

function needsSigning(url?: string | null): boolean {
  if (!url) return false;
  const v = url.trim();
  if (!v) return false;
  if (v.startsWith('data:') || v.startsWith('blob:')) return false;
  // Already a signed CDN URL
  if (v.includes('vercel-blob-delegation=') || v.includes('vercel-blob-signature=')) {
    return false;
  }
  // Already our authenticated proxy
  if (v.startsWith('/api/media/stream') || v.startsWith('/api/media/file')) return false;
  if (/^(media|blitz|uploads)\//i.test(v)) return true;
  if (v.includes('blob.vercel-storage.com') || v.includes('vercel-storage.com')) return true;
  return false;
}

/** Raw private host without signature — must never be used as img/video src. */
function isUnsafePrivateUrl(url: string): boolean {
  const v = url.trim();
  if (!v.includes('://')) return false;
  if (v.includes('vercel-blob-delegation=') || v.includes('vercel-blob-signature=')) {
    return false;
  }
  return (
    v.includes('.private.blob.vercel-storage.com') ||
    (v.includes('blob.vercel-storage.com') && !v.includes('vercel-blob-'))
  );
}

function buildSignQuery(url: string, filename?: string): string {
  const v = url.trim();
  const params = new URLSearchParams();
  if (filename) params.set('filename', filename);

  if (v.startsWith('/api/media/')) {
    try {
      const u = new URL(v, 'https://local.invalid');
      const pathname = u.searchParams.get('pathname');
      const rawUrl = u.searchParams.get('url');
      if (pathname) params.set('pathname', pathname);
      else if (rawUrl) params.set('url', rawUrl);
      else params.set('url', v);
    } catch {
      params.set('url', v);
    }
  } else if (/^(media|blitz|uploads)\//i.test(v) && !v.includes('://')) {
    params.set('pathname', v);
  } else {
    params.set('url', v.split('?')[0]);
  }
  return params.toString();
}

function streamUrls(source: string, filename?: string): MediaAccessUrls {
  const q = new URLSearchParams();
  if (source.includes('://') && !source.includes('/api/media/')) {
    q.set('url', source.split('?')[0]);
  } else if (/^(media|blitz|uploads)\//i.test(source)) {
    q.set('pathname', source);
  } else if (source.startsWith('/api/media/')) {
    try {
      const u = new URL(source, 'https://local.invalid');
      const pathname = u.searchParams.get('pathname');
      const rawUrl = u.searchParams.get('url');
      if (pathname) q.set('pathname', pathname);
      else if (rawUrl) q.set('url', rawUrl);
      else q.set('url', source);
    } catch {
      q.set('url', source);
    }
  } else {
    q.set('url', source);
  }
  if (filename) q.set('filename', filename);
  const base = q.toString();
  const preview = `/api/media/stream?${base}&disposition=inline`;
  const download = `/api/media/stream?${base}&disposition=attachment`;
  return {
    previewUrl: preview,
    downloadUrl: download,
    streamPreviewUrl: preview,
    streamDownloadUrl: download,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    fallback: true
  };
}

function isSignedCdnUrl(url: string): boolean {
  return (
    url.includes('vercel-blob-delegation=') ||
    url.includes('vercel-blob-signature=') ||
    url.includes('vercel-blob-valid-until=')
  );
}

/**
 * Resolve private Vercel Blob refs to temporary access URLs.
 * Prefers signed CDN URLs (24h), always keeps same-origin stream fallbacks.
 * Never returns raw private Blob hosts (those show "Forbidden").
 */
export function useSignedMediaUrl(
  sourceUrl?: string | null,
  opts?: { filename?: string }
): {
  url: string | null;
  downloadUrl: string | null;
  streamUrl: string | null;
  loading: boolean;
  error: string | null;
  fallback: boolean;
  refresh: () => void;
  useStreamFallback: () => void;
  ensureAccess: () => Promise<MediaAccessUrls | null>;
} {
  const filename = opts?.filename;
  const [access, setAccess] = useState<MediaAccessUrls | null>(() => {
    if (!sourceUrl) return null;
    if (!needsSigning(sourceUrl)) {
      // Already stream / data / signed CDN — safe to use
      if (isUnsafePrivateUrl(sourceUrl)) {
        return streamUrls(sourceUrl, filename);
      }
      return {
        previewUrl: sourceUrl,
        downloadUrl: sourceUrl,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      };
    }
    // Optimistic stream URLs while we mint signed ones (avoids broken private img src)
    return streamUrls(sourceUrl, filename);
  });
  const [loading, setLoading] = useState(() => Boolean(sourceUrl && needsSigning(sourceUrl)));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const resolve = useCallback(async (): Promise<MediaAccessUrls | null> => {
    if (!sourceUrl) return null;

    if (!needsSigning(sourceUrl)) {
      if (isUnsafePrivateUrl(sourceUrl)) {
        return streamUrls(sourceUrl, filename);
      }
      return {
        previewUrl: sourceUrl,
        downloadUrl: sourceUrl,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      };
    }

    const streams = streamUrls(sourceUrl, filename);

    try {
      const res = await fetch(
        `/api/media/signed-url?${buildSignQuery(sourceUrl, filename)}`,
        { credentials: 'same-origin', cache: 'no-store' }
      );
      const data = (await res.json().catch(() => ({}))) as {
        signedUrl?: string;
        downloadUrl?: string;
        previewStreamUrl?: string;
        downloadStreamUrl?: string;
        expiresAt?: number;
        fallback?: boolean;
        error?: string;
      };

      if (!res.ok && !data.signedUrl) {
        if (res.status === 401) {
          throw new Error('Please sign in to view media.');
        }
        // Stream still works for logged-in users when signing fails
        return streams;
      }

      const streamPreview = data.previewStreamUrl || streams.previewUrl;
      const streamDownload = data.downloadStreamUrl || streams.downloadUrl;

      // Prefer real signed CDN URLs; never use raw private hosts
      let preview = data.signedUrl || streamPreview;
      let download = data.downloadUrl || streamDownload;

      if (preview && isUnsafePrivateUrl(preview)) preview = streamPreview;
      if (download && isUnsafePrivateUrl(download)) download = streamDownload;

      // If API returned stream paths as signedUrl (fallback mode), mark fallback
      const usingFallback =
        Boolean(data.fallback) ||
        !isSignedCdnUrl(preview) ||
        preview.startsWith('/api/media/');

      return {
        previewUrl: preview,
        downloadUrl: download,
        streamPreviewUrl: streamPreview,
        streamDownloadUrl: streamDownload,
        expiresAt: data.expiresAt || Date.now() + 24 * 60 * 60 * 1000,
        fallback: usingFallback
      };
    } catch (err) {
      if (err instanceof Error && /sign in/i.test(err.message)) {
        throw err;
      }
      return streams;
    }
  }, [sourceUrl, filename]);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | undefined;

    async function run() {
      if (!sourceUrl) {
        setAccess(null);
        setLoading(false);
        setError(null);
        return;
      }

      // Keep stream URLs visible while refreshing signed ones
      setLoading(true);
      setError(null);
      try {
        const next = await resolve();
        if (cancelled) return;

        if (!next) {
          setAccess(null);
          setLoading(false);
          setError('Could not load media');
          return;
        }

        setAccess(next);
        setLoading(false);

        // Refresh ~30 minutes before expiry (min 5 min)
        const ms = Math.max(5 * 60_000, next.expiresAt - Date.now() - 30 * 60_000);
        refreshTimer = window.setTimeout(() => {
          if (!cancelled) setTick((t) => t + 1);
        }, ms);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Could not load media');
        // Still expose stream fallback for private refs
        if (needsSigning(sourceUrl) || isUnsafePrivateUrl(sourceUrl)) {
          setAccess(streamUrls(sourceUrl, filename));
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
    };
  }, [sourceUrl, tick, resolve, filename]);

  const useStreamFallback = useCallback(() => {
    setAccess((prev) => {
      if (!sourceUrl) return prev;
      const streams = streamUrls(sourceUrl, filename);
      if (prev?.streamPreviewUrl) {
        return {
          ...prev,
          previewUrl: prev.streamPreviewUrl,
          downloadUrl: prev.streamDownloadUrl || streams.downloadUrl,
          fallback: true
        };
      }
      return streams;
    });
  }, [sourceUrl, filename]);

  return {
    url: access?.previewUrl ?? null,
    downloadUrl: access?.downloadUrl ?? null,
    streamUrl: access?.streamPreviewUrl ?? access?.previewUrl ?? null,
    loading,
    error,
    fallback: Boolean(access?.fallback),
    refresh: () => setTick((t) => t + 1),
    useStreamFallback,
    ensureAccess: resolve
  };
}
