/** Client helpers for cloud-synced Document Review. */

import type { DocumentComment, ReviewDocument } from '@/lib/types';

export const DOCUMENTS_CHANGED = 'sdh-documents-changed';

export function notifyDocumentsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DOCUMENTS_CHANGED));
}

export async function fetchDocuments(): Promise<{
  documents: ReviewDocument[];
  total: number;
  updatedAt?: string;
  error?: string;
}> {
  const res = await fetch('/api/documents', {
    credentials: 'same-origin',
    cache: 'no-store'
  });
  const data = (await res.json().catch(() => ({}))) as {
    documents?: ReviewDocument[];
    total?: number;
    updatedAt?: string;
    error?: string;
  };

  if (!res.ok) {
    return {
      documents: [],
      total: 0,
      error: data.error || `Failed to load documents (${res.status})`
    };
  }

  return {
    documents: Array.isArray(data.documents) ? data.documents : [],
    total: data.total ?? data.documents?.length ?? 0,
    updatedAt: data.updatedAt
  };
}

export async function createDocument(
  payload: Partial<ReviewDocument> & { title: string }
): Promise<ReviewDocument> {
  const res = await fetch('/api/documents', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = (await res.json().catch(() => ({}))) as {
    document?: ReviewDocument;
    error?: string;
  };
  if (!res.ok || !data.document) {
    throw new Error(data.error || `Failed to create document (${res.status})`);
  }
  notifyDocumentsChanged();
  return data.document;
}

export async function updateDocument(
  id: string,
  patch: Partial<ReviewDocument>
): Promise<ReviewDocument> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  const data = (await res.json().catch(() => ({}))) as {
    document?: ReviewDocument;
    error?: string;
  };
  if (!res.ok || !data.document) {
    throw new Error(data.error || `Failed to update document (${res.status})`);
  }
  notifyDocumentsChanged();
  return data.document;
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'same-origin'
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Failed to delete document (${res.status})`);
  }
  notifyDocumentsChanged();
}

export async function postDocumentComment(
  id: string,
  comment: {
    body: string;
    parentId?: string | null;
    authorName?: string;
  }
): Promise<{ document: ReviewDocument; comment: DocumentComment }> {
  const res = await fetch(`/api/documents/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comment)
  });
  const data = (await res.json().catch(() => ({}))) as {
    document?: ReviewDocument;
    comment?: DocumentComment;
    error?: string;
  };
  if (!res.ok || !data.document || !data.comment) {
    throw new Error(data.error || `Failed to post comment (${res.status})`);
  }
  notifyDocumentsChanged();
  return { document: data.document, comment: data.comment };
}
