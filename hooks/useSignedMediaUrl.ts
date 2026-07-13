'use client';

import { useEffect, useState } from 'react';

function needsSigning(url?: string | null): boolean {
  if (!url) return false;
  const v = url.trim();
  if (!v) return false;
  // Local previews / already-signed CDN URLs
  if (v.startsWith('data:') || v.startsWith('blob:')) return false;
  if (v.includes('vercel-blob-delegation=') || v.includes('vercel-blob-signature=')) {
    return false;
  }
  // Our old proxy path or raw private blob URLs / pathnames
  if (v.startsWith('/api/media/file')) return true;
  if (/^(media|blitz|uploads)\//i.test(v)) return true;
  if (v.includes('blob.vercel-storage.com') || v.includes('vercel-storage.com')) return true;
  return false;
}

function buildSignQuery(url: string): string {
  const v = url.trim();
  if (v.startsWith('/api/media/file')) {
    // Pass through existing query
    try {
      const u = new URL(v, 'https://local.invalid');
      const pathname = u.searchParams.get('pathname');
      const rawUrl = u.searchParams.get('url');
      if (pathname) return `pathname=${encodeURIComponent(pathname)}`;
      if (rawUrl) return `url=${encodeURIComponent(rawUrl)}`;
    } catch {
      /* fall through */
    }
  }
  if (/^(media|blitz|uploads)\//i.test(v) && !v.includes('://')) {
    return `pathname=${encodeURIComponent(v)}`;
  }
  return `url=${encodeURIComponent(v)}`;
}

/**
 * Resolve a private Vercel Blob reference to a short-lived signed GET URL.
 * Local data:/blob: URLs pass through unchanged.
 */
export function useSignedMediaUrl(sourceUrl?: string | null): {
  url: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [url, setUrl] = useState<string | null>(() => {
    if (!sourceUrl) return null;
    if (!needsSigning(sourceUrl)) return sourceUrl;
    return null;
  });
  const [loading, setLoading] = useState(() => Boolean(sourceUrl && needsSigning(sourceUrl)));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | undefined;

    async function resolve() {
      if (!sourceUrl) {
        setUrl(null);
        setLoading(false);
        setError(null);
        return;
      }

      if (!needsSigning(sourceUrl)) {
        setUrl(sourceUrl);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/media/signed-url?${buildSignQuery(sourceUrl)}`, {
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const data = (await res.json().catch(() => ({}))) as {
          signedUrl?: string;
          expiresAt?: number;
          error?: string;
        };

        if (!res.ok || !data.signedUrl) {
          throw new Error(data.error || `Could not sign media URL (${res.status})`);
        }

        if (cancelled) return;
        setUrl(data.signedUrl);
        setLoading(false);

        // Refresh a few minutes before expiry
        if (data.expiresAt) {
          const ms = Math.max(30_000, data.expiresAt - Date.now() - 5 * 60_000);
          refreshTimer = window.setTimeout(() => {
            if (!cancelled) setTick((t) => t + 1);
          }, ms);
        }
      } catch (err) {
        if (cancelled) return;
        setUrl(null);
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Failed to load media');
      }
    }

    void resolve();

    return () => {
      cancelled = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
    };
  }, [sourceUrl, tick]);

  return {
    url,
    loading,
    error,
    refresh: () => setTick((t) => t + 1)
  };
}
