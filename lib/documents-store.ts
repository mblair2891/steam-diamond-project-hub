import 'server-only';
import { get, put } from '@vercel/blob';
import { listAllBlobs, displayNameFromPathname } from '@/lib/media-library';
import type {
  DocumentComment,
  DocumentReviewStatus,
  ReviewDocument
} from '@/lib/types';
import { DOCUMENT_REVIEW_STATUSES } from '@/lib/types';

/** Shared Document Review store (synced across all devices). */
export const DOCUMENTS_STORE_PATH = 'documents/store.json';
/** PDF / file prefix for document uploads. */
export const DOCUMENTS_FILES_PREFIX = 'documents/';

export type DocumentsStore = {
  version: 1;
  documents: ReviewDocument[];
  updatedAt?: string;
};

export function emptyDocumentsStore(): DocumentsStore {
  return { version: 1, documents: [] };
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

function normalizeStatus(raw: unknown): DocumentReviewStatus {
  const s = String(raw ?? '').trim();
  if ((DOCUMENT_REVIEW_STATUSES as string[]).includes(s)) {
    return s as DocumentReviewStatus;
  }
  const lower = s.toLowerCase();
  if (lower === 'draft') return 'Draft';
  if (lower === 'under review' || lower === 'under-review' || lower === 'review') {
    return 'Under Review';
  }
  if (lower === 'approved') return 'Approved';
  if (lower === 'rejected') return 'Rejected';
  return 'Draft';
}

function normalizeComment(c: DocumentComment): DocumentComment {
  return {
    id: c.id,
    parentId: c.parentId ?? null,
    authorId: c.authorId || '',
    authorName: c.authorName || 'User',
    body: c.body || '',
    createdAt: c.createdAt || new Date().toISOString()
  };
}

export function normalizeDocument(d: ReviewDocument): ReviewDocument {
  return {
    id: d.id,
    title: (d.title || 'Untitled document').trim() || 'Untitled document',
    description: d.description || '',
    status: normalizeStatus(d.status),
    version: typeof d.version === 'number' && d.version > 0 ? d.version : 1,
    fileName: d.fileName ?? null,
    fileUrl: d.fileUrl ?? null,
    pathname: d.pathname ?? null,
    mime: d.mime ?? null,
    size: d.size ?? null,
    redlineFileName: d.redlineFileName ?? null,
    redlineFileUrl: d.redlineFileUrl ?? null,
    redlinePathname: d.redlinePathname ?? null,
    redlineMime: d.redlineMime ?? null,
    redlineSize: d.redlineSize ?? null,
    comments: Array.isArray(d.comments) ? d.comments.map(normalizeComment) : [],
    createdAt: d.createdAt || new Date().toISOString(),
    updatedAt: d.updatedAt || d.createdAt || new Date().toISOString(),
    uploadedById: d.uploadedById ?? null,
    uploadedByName: d.uploadedByName ?? null
  };
}

export async function loadDocumentsStore(token?: string): Promise<DocumentsStore> {
  const t = token || requireToken();
  try {
    const result = await get(DOCUMENTS_STORE_PATH, {
      access: 'private',
      token: t,
      useCache: false
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return emptyDocumentsStore();
    }
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text) as DocumentsStore;
    if (!parsed || typeof parsed !== 'object') return emptyDocumentsStore();
    const documents = Array.isArray(parsed.documents)
      ? parsed.documents.map(normalizeDocument)
      : [];
    return {
      version: 1,
      documents,
      updatedAt: parsed.updatedAt
    };
  } catch {
    return emptyDocumentsStore();
  }
}

export async function saveDocumentsStore(
  store: DocumentsStore,
  token?: string
): Promise<DocumentsStore> {
  const t = token || requireToken();
  const body: DocumentsStore = {
    version: 1,
    documents: store.documents.map(normalizeDocument),
    updatedAt: new Date().toISOString()
  };
  await put(DOCUMENTS_STORE_PATH, JSON.stringify(body, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: t,
    cacheControlMaxAge: 60
  });
  return body;
}

/**
 * List documents from shared store.
 * Also surfaces orphan PDFs under documents/ (uploaded before store existed)
 * so cross-device recovery works without re-upload.
 */
export async function listDocuments(token?: string): Promise<{
  documents: ReviewDocument[];
  updatedAt?: string;
  total: number;
}> {
  const t = token || requireToken();
  const store = await loadDocumentsStore(t);
  const byId = new Map(store.documents.map((d) => [d.id, d]));
  const knownPaths = new Set<string>();
  for (const d of store.documents) {
    if (d.pathname) knownPaths.add(d.pathname);
    if (d.redlinePathname) knownPaths.add(d.redlinePathname);
  }

  // Recover file-only blobs (e.g. lease PDF uploaded before cloud meta)
  try {
    const blobs = await listAllBlobs(DOCUMENTS_FILES_PREFIX, t);
    for (const blob of blobs) {
      if (
        !blob.pathname ||
        blob.pathname === DOCUMENTS_STORE_PATH ||
        blob.pathname.endsWith('/store.json') ||
        blob.pathname.endsWith('/') ||
        knownPaths.has(blob.pathname)
      ) {
        continue;
      }
      // Skip non-PDF orphans quietly (floor plan images may share folder historically)
      if (!/\.pdf$/i.test(blob.pathname) && blob.pathname.includes('.')) {
        // still include if no extension match — only skip obvious non-docs later
      }
      if (!/\.pdf$/i.test(blob.pathname)) continue;

      const name = displayNameFromPathname(blob.pathname);
      const uploaded =
        blob.uploadedAt instanceof Date
          ? blob.uploadedAt.toISOString()
          : new Date(blob.uploadedAt).toISOString();
      const orphan: ReviewDocument = {
        id: `blob_${blob.pathname.replace(/[^a-zA-Z0-9._-]+/g, '_')}`,
        title: name.replace(/\.pdf$/i, '') || name,
        description: 'Recovered from cloud storage (sync this record by editing title/status).',
        status: 'Under Review',
        version: 1,
        fileName: name,
        fileUrl: blob.url,
        pathname: blob.pathname,
        mime: 'application/pdf',
        size: blob.size,
        redlineFileName: null,
        redlineFileUrl: null,
        redlinePathname: null,
        redlineMime: null,
        redlineSize: null,
        comments: [],
        createdAt: uploaded,
        updatedAt: uploaded,
        uploadedById: null,
        uploadedByName: null
      };
      byId.set(orphan.id, orphan);
    }
  } catch (err) {
    console.warn('[documents-store] orphan blob scan failed', err);
  }

  const documents = [...byId.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
  return {
    documents,
    updatedAt: store.updatedAt,
    total: documents.length
  };
}

export async function getDocument(
  id: string,
  token?: string
): Promise<ReviewDocument | null> {
  const store = await loadDocumentsStore(token);
  return store.documents.find((d) => d.id === id) || null;
}

export async function upsertDocument(
  doc: ReviewDocument,
  token?: string
): Promise<ReviewDocument> {
  const t = token || requireToken();
  const store = await loadDocumentsStore(t);
  const next = normalizeDocument({
    ...doc,
    updatedAt: new Date().toISOString()
  });
  const idx = store.documents.findIndex((d) => d.id === next.id);
  if (idx >= 0) {
    // Preserve comments if client omitted them accidentally
    const prev = store.documents[idx];
    if (!Array.isArray(doc.comments)) {
      next.comments = prev.comments;
    }
    store.documents[idx] = next;
  } else {
    store.documents.push(next);
  }
  await saveDocumentsStore(store, t);
  return next;
}

export async function patchDocument(
  id: string,
  patch: Partial<ReviewDocument>,
  token?: string
): Promise<ReviewDocument | null> {
  const t = token || requireToken();
  const store = await loadDocumentsStore(t);
  const idx = store.documents.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const prev = store.documents[idx];
  const { comments: _c, id: _id, createdAt: _ca, ...rest } = patch;
  const next = normalizeDocument({
    ...prev,
    ...rest,
    id: prev.id,
    createdAt: prev.createdAt,
    comments: prev.comments,
    updatedAt: new Date().toISOString()
  });
  store.documents[idx] = next;
  await saveDocumentsStore(store, t);
  return next;
}

export async function appendDocumentComment(
  id: string,
  comment: DocumentComment,
  token?: string
): Promise<ReviewDocument | null> {
  const t = token || requireToken();
  const store = await loadDocumentsStore(t);
  const idx = store.documents.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const prev = store.documents[idx];
  const full = normalizeComment(comment);
  const next = normalizeDocument({
    ...prev,
    comments: [...(prev.comments || []), full],
    updatedAt: new Date().toISOString()
  });
  store.documents[idx] = next;
  await saveDocumentsStore(store, t);
  return next;
}

export async function deleteDocument(
  id: string,
  token?: string
): Promise<{ ok: boolean; document?: ReviewDocument }> {
  const t = token || requireToken();
  const store = await loadDocumentsStore(t);
  const idx = store.documents.findIndex((d) => d.id === id);
  if (idx < 0) return { ok: false };
  const [removed] = store.documents.splice(idx, 1);
  await saveDocumentsStore(store, t);
  return { ok: true, document: removed };
}
