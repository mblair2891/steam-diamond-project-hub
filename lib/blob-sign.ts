import 'server-only';
import { getDownloadUrl, head, issueSignedToken, presignUrl } from '@vercel/blob';

/** Signed GET URL lifetime (ms). Blob max is 7 days — use 24h for reliable previews. */
export const SIGNED_URL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DELEGATION_TTL_MS = 25 * 60 * 60 * 1000; // 25 hours (covers URL TTL + buffer)

/**
 * Extract blob pathname from a full Vercel Blob URL or return a bare pathname.
 */
export function extractBlobPathname(urlOrPathname: string): string {
  const v = urlOrPathname.trim();
  if (!v) return '';

  // Proxy paths: /api/media/file?pathname=… or ?url=…
  if (v.includes('/api/media/')) {
    try {
      const base = v.startsWith('http')
        ? v
        : `https://local.invalid${v.startsWith('/') ? v : `/${v}`}`;
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
  // Pathnames under app folders (media library, blitz, uploads, document review)
  if (/^(media|blitz|uploads|documents|floorplans)\//i.test(v)) return true;
  return v.includes('blob.vercel-storage.com') || v.includes('vercel-storage.com');
}

/** True when the browser would hit a private Blob host without a signature. */
export function isRawPrivateBlobUrl(value: string): boolean {
  const v = value.trim();
  if (!v.includes('://')) return false;
  if (v.includes('vercel-blob-delegation=') || v.includes('vercel-blob-signature=')) {
    return false;
  }
  return (
    v.includes('.private.blob.vercel-storage.com') ||
    (v.includes('blob.vercel-storage.com') && !v.includes('vercel-blob-'))
  );
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
 * Resolve the canonical pathname (and url when available) for a stored ref.
 * Prefer `head()` so random suffixes / encodings match the store exactly.
 */
export async function resolveBlobIdentity(
  urlOrPathname: string
): Promise<{ pathname: string; url?: string }> {
  const tokenEnv = requireToken();
  const raw = urlOrPathname.trim();
  const extracted = extractBlobPathname(raw);

  if (!extracted || extracted.includes('..')) {
    throw new Error('Invalid blob path.');
  }

  // Prefer full URL for head when we have one (most reliable across store hosts)
  const headTarget =
    raw.includes('://') && !raw.includes('/api/media/')
      ? raw.split('?')[0]
      : extracted;

  try {
    const meta = await head(headTarget, { token: tokenEnv });
    return {
      pathname: meta.pathname || extracted,
      url: meta.url || undefined
    };
  } catch {
    // Blob may still be readable via get/sign with the extracted path
    return { pathname: extracted };
  }
}

/**
 * Build same-origin stream URLs (Clerk cookie auth + server-side get()).
 * Always works for signed-in users when BLOB_READ_WRITE_TOKEN is set.
 */
export function buildStreamUrls(
  target: string,
  filename?: string | null
): { previewStreamUrl: string; downloadStreamUrl: string; pathname: string } {
  const pathname = extractBlobPathname(target);
  const q = new URLSearchParams();
  if (target.includes('://') && !target.includes('/api/media/')) {
    q.set('url', target.split('?')[0]);
  } else {
    q.set('pathname', pathname);
  }
  if (filename) q.set('filename', filename);
  const base = q.toString();
  return {
    previewStreamUrl: `/api/media/stream?${base}&disposition=inline`,
    downloadStreamUrl: `/api/media/stream?${base}&disposition=attachment`,
    pathname
  };
}

/**
 * Create temporary signed GET URLs for a private Vercel Blob.
 * Must run on the server only (uses BLOB_READ_WRITE_TOKEN).
 */
export async function createSignedGetUrl(
  urlOrPathname: string,
  opts?: { ttlMs?: number }
): Promise<{
  signedUrl: string;
  downloadUrl: string;
  pathname: string;
  expiresAt: number;
}> {
  const tokenEnv = requireToken();
  const identity = await resolveBlobIdentity(urlOrPathname);
  const pathname = identity.pathname;

  if (!pathname) {
    throw new Error('Missing blob pathname.');
  }
  if (pathname.includes('..')) {
    throw new Error('Invalid pathname.');
  }

  const ttl = opts?.ttlMs ?? SIGNED_URL_TTL_MS;
  const now = Date.now();
  // Cap under Blob's 7-day max for signed tokens
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
