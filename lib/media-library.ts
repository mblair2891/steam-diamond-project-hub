import 'server-only';
import { get, list, put } from '@vercel/blob';
import type { MediaAsset, MediaDraftStatus } from '@/lib/types';

/** Shared library metadata (synced across devices). */
export const LIBRARY_META_PATH = 'library/meta.json';
/** Blob prefix for Media Library uploads. */
export const LIBRARY_PREFIX = 'media/';

export type LibraryMetaEntry = {
  title?: string;
  description?: string;
  notes?: string;
  scheduledDate?: string;
  status?: MediaDraftStatus;
  assigneeId?: string | null;
  assigneeName?: string | null;
  /** Original upload filename when different from pathname tail */
  name?: string;
  mime?: string;
};

export type LibraryMetaStore = {
  version: 1;
  byPathname: Record<string, LibraryMetaEntry>;
  updatedAt?: string;
};

export function emptyMetaStore(): LibraryMetaStore {
  return { version: 1, byPathname: {} };
}

function requireToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is not configured. Add it in Vercel env and redeploy.'
    );
  }
  return token;
}

export function mimeFromPathname(pathname: string, fallback = 'application/octet-stream'): string {
  const ext = pathname.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    avif: 'image/avif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    m4v: 'video/x-m4v',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return map[ext] || fallback;
}

/** Stable client id from blob pathname (same on every device). */
export function assetIdFromPathname(pathname: string): string {
  // Encode so it is a valid HTML/React key without relying on localStorage
  return `blob_${pathname.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
}

export function displayNameFromPathname(pathname: string): string {
  const base = pathname.split('/').pop() || pathname;
  // Strip leading timestamp- and trailing random suffix when present
  // e.g. 1710000000000-My_Photo-AbCdEfGhIjKlMnOp.jpg → My_Photo.jpg
  let name = base;
  name = name.replace(/^\d{10,15}-/, '');
  // Random suffix from addRandomSuffix is typically before extension: name-XXXXXXXX.ext
  const m = name.match(/^(.*)-[A-Za-z0-9]{10,}\.(\w+)$/);
  if (m) name = `${m[1]}.${m[2]}`;
  return name || base;
}

export async function loadLibraryMeta(token?: string): Promise<LibraryMetaStore> {
  const t = token || requireToken();
  try {
    const result = await get(LIBRARY_META_PATH, { access: 'private', token: t, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return emptyMetaStore();
    }
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text) as LibraryMetaStore;
    if (!parsed || typeof parsed !== 'object') return emptyMetaStore();
    return {
      version: 1,
      byPathname: parsed.byPathname && typeof parsed.byPathname === 'object' ? parsed.byPathname : {},
      updatedAt: parsed.updatedAt
    };
  } catch {
    return emptyMetaStore();
  }
}

export async function saveLibraryMeta(store: LibraryMetaStore, token?: string): Promise<void> {
  const t = token || requireToken();
  const body: LibraryMetaStore = {
    version: 1,
    byPathname: store.byPathname,
    updatedAt: new Date().toISOString()
  };
  await put(LIBRARY_META_PATH, JSON.stringify(body, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: t,
    cacheControlMaxAge: 60
  });
}

export async function upsertLibraryMetaEntry(
  pathname: string,
  entry: LibraryMetaEntry,
  token?: string
): Promise<LibraryMetaStore> {
  const t = token || requireToken();
  const store = await loadLibraryMeta(t);
  const prev = store.byPathname[pathname] || {};
  store.byPathname[pathname] = { ...prev, ...entry };
  await saveLibraryMeta(store, t);
  return store;
}

export async function removeLibraryMetaEntry(
  pathname: string,
  token?: string
): Promise<LibraryMetaStore> {
  const t = token || requireToken();
  const store = await loadLibraryMeta(t);
  if (store.byPathname[pathname]) {
    delete store.byPathname[pathname];
    await saveLibraryMeta(store, t);
  }
  return store;
}

/** List all blobs under a prefix (handles pagination). */
export async function listAllBlobs(prefix: string, token?: string) {
  const t = token || requireToken();
  const blobs: Array<{
    url: string;
    downloadUrl: string;
    pathname: string;
    size: number;
    uploadedAt: Date;
    etag: string;
  }> = [];

  let cursor: string | undefined;
  do {
    const page = await list({
      prefix,
      cursor,
      limit: 1000,
      token: t
    });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return blobs;
}

export function blobToMediaAsset(
  blob: {
    url: string;
    pathname: string;
    size: number;
    uploadedAt: Date | string;
  },
  meta?: LibraryMetaEntry | null
): MediaAsset {
  const name = meta?.name || displayNameFromPathname(blob.pathname);
  const mime = meta?.mime || mimeFromPathname(blob.pathname);
  const uploaded =
    blob.uploadedAt instanceof Date
      ? blob.uploadedAt.toISOString()
      : new Date(blob.uploadedAt).toISOString();

  return {
    id: assetIdFromPathname(blob.pathname),
    name,
    mime,
    size: blob.size,
    fileUrl: blob.url,
    pathname: blob.pathname,
    notes: meta?.notes || meta?.description || '',
    title: meta?.title || name.replace(/\.[^.]+$/, '') || name,
    description: meta?.description || meta?.notes || '',
    scheduledDate: meta?.scheduledDate || '',
    status: meta?.status || 'draft',
    addedAt: uploaded,
    assigneeId: meta?.assigneeId ?? null,
    assigneeName: meta?.assigneeName ?? null
  };
}

/**
 * Build the full Media Library from Vercel Blob list + shared meta.
 * Source of truth for files across devices.
 */
export async function buildLibraryAssets(token?: string): Promise<{
  assets: MediaAsset[];
  total: number;
  metaUpdatedAt?: string;
}> {
  const t = token || requireToken();
  const [blobs, meta] = await Promise.all([listAllBlobs(LIBRARY_PREFIX, t), loadLibraryMeta(t)]);

  // Exclude any accidental nested meta under media/
  const files = blobs.filter(
    (b) =>
      b.pathname &&
      !b.pathname.endsWith('/meta.json') &&
      b.pathname !== LIBRARY_META_PATH &&
      !b.pathname.endsWith('/')
  );

  // Newest first
  files.sort((a, b) => {
    const ta = a.uploadedAt instanceof Date ? a.uploadedAt.getTime() : +new Date(a.uploadedAt);
    const tb = b.uploadedAt instanceof Date ? b.uploadedAt.getTime() : +new Date(b.uploadedAt);
    return tb - ta;
  });

  const assets = files.map((b) => blobToMediaAsset(b, meta.byPathname[b.pathname]));

  return {
    assets,
    total: assets.length,
    metaUpdatedAt: meta.updatedAt
  };
}
