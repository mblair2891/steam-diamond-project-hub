import 'server-only';
import { issueSignedToken, presignUrl } from '@vercel/blob';

/** Signed GET URLs last this long (ms). */
export const SIGNED_URL_TTL_MS = 55 * 60 * 1000; // 55 minutes
const DELEGATION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Extract blob pathname from a full Vercel Blob URL or return a bare pathname.
 */
export function extractBlobPathname(urlOrPathname: string): string {
  const v = urlOrPathname.trim();
  if (!v) return '';

  if (!v.includes('://')) {
    return v.replace(/^\//, '');
  }

  try {
    const u = new URL(v);
    // pathname is "/media/foo.png" — strip leading slash
    return decodeURIComponent(u.pathname.replace(/^\//, ''));
  } catch {
    return v.replace(/^\//, '');
  }
}

export function isVercelBlobRef(value: string): boolean {
  const v = value.trim();
  if (!v || v.startsWith('data:') || v.startsWith('blob:')) return false;
  if (v.startsWith('/api/media/')) return true;
  if (/^(media|blitz|uploads)\//i.test(v)) return true;
  return v.includes('blob.vercel-storage.com') || v.includes('vercel-storage.com');
}

/**
 * Create a short-lived signed GET URL for a private Vercel Blob.
 * Must run on the server only (uses BLOB_READ_WRITE_TOKEN).
 */
export async function createSignedGetUrl(
  urlOrPathname: string,
  opts?: { ttlMs?: number }
): Promise<{ signedUrl: string; pathname: string; expiresAt: number }> {
  const tokenEnv = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!tokenEnv) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured.');
  }

  let pathname = extractBlobPathname(urlOrPathname);

  // Support /api/media/file?pathname=… or ?url=… stored as viewUrl
  if (pathname.startsWith('api/media/file') || urlOrPathname.includes('/api/media/file')) {
    try {
      const base =
        urlOrPathname.startsWith('http') || urlOrPathname.startsWith('/')
          ? urlOrPathname.startsWith('http')
            ? urlOrPathname
            : `https://local.invalid${urlOrPathname}`
          : `https://local.invalid/${urlOrPathname}`;
      const u = new URL(base);
      const p = u.searchParams.get('pathname');
      const rawUrl = u.searchParams.get('url');
      if (p) pathname = extractBlobPathname(p);
      else if (rawUrl) pathname = extractBlobPathname(rawUrl);
    } catch {
      /* keep pathname */
    }
  }

  if (!pathname) {
    throw new Error('Missing blob pathname.');
  }
  if (pathname.includes('..')) {
    throw new Error('Invalid pathname.');
  }

  const ttl = opts?.ttlMs ?? SIGNED_URL_TTL_MS;
  const now = Date.now();
  const delegationUntil = now + DELEGATION_TTL_MS;
  const urlUntil = now + Math.min(ttl, DELEGATION_TTL_MS - 60_000);

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
    validUntil: urlUntil
  });

  return {
    signedUrl: presignedUrl,
    pathname,
    expiresAt: urlUntil
  };
}
