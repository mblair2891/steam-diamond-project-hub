'use client';

import { useCallback, useEffect, useState } from 'react';

export type MediaAccessUrls = {
  /** For <img>/<video> preview */
  previewUrl: string;
  /** Force download */
  downloadUrl: string;
  expiresAt: number;
  fallback?: boolean;
};

function needsSigning(url?: string | null): boolean {
  if (!url) return false;
  const v = url.trim();
  if (!v) return false;
  if (v.startsWith('data:') || v.startsWith('blob:')) return false;
  if (v.includes('vercel-blob-delegation=') || v.includes('vercel-blob-signature=')) {
    return false;
  }
  if (v.startsWith('/api/media/stream') || v.startsWith('/api/media/file')) return true;
  if (/^(media|blitz|uploads)\//i.test(v)) return true;
  if (v.includes('blob.vercel-storage.com') || v.includes('vercel-storage.com')) return true;
  return false;
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
  if (source.includes('://')) q.set('url', source.split('?')[0]);
  else if (/^(media|blitz|uploads)\//i.test(source)) q.set('pathname', source);
  else q.set('url', source);
  if (filename) q.set('filename', filename);
  const base = q.toString();
  return {
    previewUrl: `/api/media/stream?${base}&disposition=inline`,
    downloadUrl: `/api/media/stream?${base}&disposition=attachment`,
    expiresAt: Date.now() + 30 * 60 * 1000,
    fallback: true
  };
}

/**
 * Resolve private Vercel Blob refs to temporary access URLs (signed CDN + stream fallback).
 */
export function useSignedMediaUrl(
  sourceUrl?: string | null,
  opts?: { filename?: string }
): {
  url: string | null;
  downloadUrl: string | null;
  loading: boolean;
  error: string | null;
  fallback: boolean;
  refresh: () => void;
  ensureAccess: () => Promise<MediaAccessUrls | null>;
} {
  const filename = opts?.filename;
  const [access, setAccess] = useState<MediaAccessUrls | null>(() => {
    if (!sourceUrl) return null;
    if (!needsSigning(sourceUrl)) {
      return {
        previewUrl: sourceUrl,
        downloadUrl: sourceUrl,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      };
    }
    return null;
  });
  const [loading, setLoading] = useState(() => Boolean(sourceUrl && needsSigning(sourceUrl)));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const resolve = useCallback(async (): Promise<MediaAccessUrls | null> => {
    if (!sourceUrl) return null;

    if (!needsSigning(sourceUrl)) {
      return {
        previewUrl: sourceUrl,
        downloadUrl: sourceUrl,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      };
    }

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
        // Last resort: same-origin stream
        return streamUrls(sourceUrl, filename);
      }

      const preview =
        data.signedUrl || data.previewStreamUrl || streamUrls(sourceUrl, filename).previewUrl;
      const download =
        data.downloadUrl ||
        data.downloadStreamUrl ||
        streamUrls(sourceUrl, filename).downloadUrl;

      return {
        previewUrl: preview,
        downloadUrl: download,
        expiresAt: data.expiresAt || Date.now() + 6 * 60 * 60 * 1000,
        fallback: Boolean(data.fallback)
      };
    } catch {
      return streamUrls(sourceUrl, filename);
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

      setLoading(true);
      setError(null);
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

      // Refresh ~10 minutes before expiry (min 2 min)
      const ms = Math.max(120_000, next.expiresAt - Date.now() - 10 * 60_000);
      refreshTimer = window.setTimeout(() => {
        if (!cancelled) setTick((t) => t + 1);
      }, ms);
    }

    void run();
    return () => {
      cancelled = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
    };
  }, [sourceUrl, tick, resolve]);

  return {
    url: access?.previewUrl ?? null,
    downloadUrl: access?.downloadUrl ?? null,
    loading,
    error,
    fallback: Boolean(access?.fallback),
    refresh: () => setTick((t) => t + 1),
    ensureAccess: resolve
  };
}
