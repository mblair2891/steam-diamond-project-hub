import 'server-only';
import { getDownloadUrl, issueSignedToken, presignUrl } from '@vercel/blob';

/** Signed GET URLs last this long (ms). Max allowed by Blob is 7 days. */
export const SIGNED_URL_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DELEGATION_TTL_MS = 7 * 60 * 60 * 1000; // 7 hours (covers URL TTL + buffer)

/**
 * Extract blob pathname from a full Vercel Blob URL or return a bare pathname.
 */
export function extractBlobPathname(urlOrPathname: string): string {
  const v = urlOrPathname.trim();
  if (!v) return '';

  // Proxy paths: /api/media/file?pathname=… or ?url=…
  if (v.includes('/api/media/')) {
    try {
      const base = v.startsWith('http') ? v : `https://local.invalid${v.startsWith('/') ? v : `/${v}`}`;
      const u = new URL(base);
      const p = u.searchParams.get('pathname');
      const rawUrl = u.searchParams.get('url');
      if (p) return extractBlobPathname(p);
      if (rawUrl) return extractBlobPathname(rawUrl);
    } catch {
      /* fall through */
    }
  }

  if (!v.includes('://')) {
    return decodeURIComponent(v.replace(/^\//, ''));
  }

  try {
    const u = new URL(v);
    // Strip query (signed params, download=1, etc.)
    return decodeURIComponent(u.pathname.replace(/^\//, ''));
  } catch {
    return decodeURIComponent(v.replace(/^\//, ''));
  }
}

export function isVercelBlobRef(value: string): boolean {
  const v = value.trim();
  if (!v || v.startsWith('data:') || v.startsWith('blob:')) return false;
  if (v.startsWith('/api/media/')) return true;
  if (/^(media|blitz|uploads)\//i.test(v)) return true;
  return v.includes('blob.vercel-storage.com') || v.includes('vercel-storage.com');
}

function requireToken(): string {
  const tokenEnv = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!tokenEnv) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is not configured. Add it in Vercel env and redeploy.'
    );
  }
  return tokenEnv;
}

/**
 * Create short-lived signed GET URLs for a private Vercel Blob.
 * Must run on the server only (uses BLOB_READ_WRITE_TOKEN).
 */
export async function createSignedGetUrl(
  urlOrPathname: string,
  opts?: { ttlMs?: number; forDownload?: boolean }
): Promise<{
  signedUrl: string;
  downloadUrl: string;
  pathname: string;
  expiresAt: number;
}> {
  const tokenEnv = requireToken();
  const pathname = extractBlobPathname(urlOrPathname);

  if (!pathname) {
    throw new Error('Missing blob pathname.');
  }
  if (pathname.includes('..')) {
    throw new Error('Invalid pathname.');
  }

  const ttl = opts?.ttlMs ?? SIGNED_URL_TTL_MS;
  const now = Date.now();
  // Cap URL lifetime under delegation max (7 days)
  const maxDelegation = Math.min(DELEGATION_TTL_MS, 7 * 24 * 60 * 60 * 1000 - 60_000);
  const delegationUntil = now + maxDelegation;
  const urlUntil = Math.min(now + ttl, delegationUntil - 60_000);

  const signedToken = await issueSignedToken({
    pathname,
    operations: ['get'],
    validUntil: delegationUntil,
    token: tokenEnv
  });

  const { presignedUrl } = await presignUrl(signedToken, {
    operation: 'get',
    pathname,
    access: 'private',
    validUntil: urlUntil,
    useCache: true
  });

  // Download variant: browser treats response as attachment
  let downloadUrl = presignedUrl;
  try {
    downloadUrl = getDownloadUrl(presignedUrl);
  } catch {
    const join = presignedUrl.includes('?') ? '&' : '?';
    downloadUrl = `${presignedUrl}${join}download=1`;
  }

  return {
    signedUrl: presignedUrl,
    downloadUrl,
    pathname,
    expiresAt: urlUntil
  };
}
