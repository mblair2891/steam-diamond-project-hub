'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DocumentFileActions from '@/components/DocumentFileActions';
import Modal from '@/components/Modal';
import { useToast } from '@/components/ToastProvider';
import { useRole } from '@/hooks/useRole';
import { uploadToBlob } from '@/lib/blob-upload';
import {
  createDocument,
  deleteDocument as deleteDocumentApi,
  DOCUMENTS_CHANGED,
  fetchDocuments,
  postDocumentComment,
  updateDocument
} from '@/lib/documents-client';
import {
  DOCUMENT_REVIEW_STATUSES,
  documentNeedsReview,
  reviewDocumentFileRef,
  reviewDocumentRedlineRef,
  type DocumentComment,
  type DocumentReviewStatus,
  type ReviewDocument
} from '@/lib/types';

type StatusFilter = 'all' | DocumentReviewStatus | 'needs-review';

function formatBytes(n?: number | null) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: DocumentReviewStatus) {
  if (status === 'Approved') return 'badge-approved';
  if (status === 'Rejected') return 'badge-rejected';
  if (status === 'Under Review') return 'badge-review';
  return 'badge-draft';
}

function emptyDoc(): ReviewDocument {
  return {
    id: '',
    title: '',
    description: '',
    status: 'Draft',
    version: 1,
    fileName: null,
    fileUrl: null,
    pathname: null,
    mime: 'application/pdf',
    size: null,
    redlineFileName: null,
    redlineFileUrl: null,
    redlinePathname: null,
    redlineMime: null,
    redlineSize: null,
    comments: [],
    createdAt: '',
    updatedAt: '',
    uploadedById: null,
    uploadedByName: null
  };
}

function isPdfFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type === 'application/pdf' || name.endsWith('.pdf');
}

function buildCommentTree(comments: DocumentComment[]) {
  const byParent = new Map<string | null, DocumentComment[]>();
  const sorted = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const c of sorted) {
    const key = c.parentId || null;
    const list = byParent.get(key) || [];
    list.push(c);
    byParent.set(key, list);
  }
  return byParent;
}

function CommentThread({
  comments,
  parentId,
  depth,
  replyTo,
  onReply
}: {
  comments: Map<string | null, DocumentComment[]>;
  parentId: string | null;
  depth: number;
  replyTo: string | null;
  onReply: (id: string | null) => void;
}) {
  const list = comments.get(parentId) || [];
  if (!list.length) return null;

  return (
    <ul className={depth === 0 ? 'space-y-3' : 'mt-2 space-y-2 border-l border-surface-600 pl-3'}>
      {list.map((c) => (
        <li key={c.id}>
          <div className="rounded-lg border border-surface-600 bg-surface-950/50 px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{c.authorName}</span>
              <span className="text-[11px] text-ink-dim">{formatDateTime(c.createdAt)}</span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-muted">{c.body}</p>
            <button
              type="button"
              className="btn-ghost btn-sm mt-1.5 !px-1.5 text-[11px]"
              onClick={() => onReply(replyTo === c.id ? null : c.id)}
            >
              {replyTo === c.id ? 'Cancel reply' : 'Reply'}
            </button>
          </div>
          <CommentThread
            comments={comments}
            parentId={c.id}
            depth={depth + 1}
            replyTo={replyTo}
            onReply={onReply}
          />
        </li>
      ))}
    </ul>
  );
}

function upsertLocal(
  list: ReviewDocument[],
  doc: ReviewDocument
): ReviewDocument[] {
  const idx = list.findIndex((x) => x.id === doc.id);
  if (idx < 0) return [doc, ...list];
  const next = [...list];
  next[idx] = doc;
  return next;
}

export default function DocumentsPage() {
  const { canEdit, user, displayName, isLoaded: roleLoaded } = useRole();
  const { success, error: toastError } = useToast();

  const [docs, setDocs] = useState<ReviewDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'new' | 'edit' | null>(null);
  const [form, setForm] = useState<ReviewDocument>(emptyDoc());

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const mainFileRef = useRef<HTMLInputElement>(null);
  const redlineFileRef = useRef<HTMLInputElement>(null);
  const newMainFileRef = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    setListError(null);
    try {
      const result = await fetchDocuments();
      if (result.error) {
        setListError(result.error);
        setDocs([]);
      } else {
        setDocs(result.documents);
        setFetchedAt(result.updatedAt || new Date().toISOString());
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load documents');
      setDocs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    const onChange = () => {
      void loadLibrary({ soft: true });
    };
    window.addEventListener(DOCUMENTS_CHANGED, onChange);
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadLibrary({ soft: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener(DOCUMENTS_CHANGED, onChange);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadLibrary]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...docs]
      .filter((d) => {
        if (statusFilter === 'needs-review') return documentNeedsReview(d);
        if (statusFilter !== 'all' && d.status !== statusFilter) return false;
        if (!q) return true;
        return (
          d.title.toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q) ||
          (d.fileName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [docs, statusFilter, search]);

  const selected = selectedId ? docs.find((d) => d.id === selectedId) || null : null;
  const commentTree = useMemo(
    () => buildCommentTree(selected?.comments || []),
    [selected?.comments]
  );

  const needsReviewCount = docs.filter(documentNeedsReview).length;

  function openNew() {
    setForm(emptyDoc());
    setModal('new');
  }

  function openEdit(doc: ReviewDocument) {
    setForm({ ...emptyDoc(), ...doc });
    setModal('edit');
  }

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !form.id) return;
    const title = form.title.trim();
    if (!title) return;

    setSaving(true);
    try {
      const saved = await updateDocument(form.id, {
        title,
        description: (form.description || '').trim(),
        status: form.status || 'Draft',
        version: form.version || 1
      });
      setDocs((list) => upsertLocal(list, saved));
      setSelectedId(saved.id);
      setModal(null);
      success('Document updated');
    } catch (err) {
      toastError(
        'Save failed',
        err instanceof Error ? err.message : 'Could not update document'
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadPdf(
    file: File,
    kind: 'main' | 'redline',
    docId: string
  ): Promise<void> {
    if (!canEdit) return;
    if (!isPdfFile(file)) {
      toastError('Invalid file', 'Please upload a PDF file.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadLabel(kind === 'main' ? 'Uploading document…' : 'Uploading redline…');

    try {
      const result = await uploadToBlob({
        file,
        folder: 'documents',
        onProgress: (pct) => setUploadProgress(pct)
      });

      const prev = docs.find((d) => d.id === docId);
      let patch: Partial<ReviewDocument>;
      if (kind === 'main') {
        const bumpVersion = Boolean(prev?.fileUrl || prev?.pathname);
        patch = {
          fileName: result.name || file.name,
          fileUrl: result.url,
          pathname: result.pathname,
          mime: result.contentType || 'application/pdf',
          size: result.size,
          version: bumpVersion ? (prev?.version || 1) + 1 : prev?.version || 1,
          uploadedById: user?.id || prev?.uploadedById || null,
          uploadedByName: displayName || prev?.uploadedByName || null
        };
      } else {
        patch = {
          redlineFileName: result.name || file.name,
          redlineFileUrl: result.url,
          redlinePathname: result.pathname,
          redlineMime: result.contentType || 'application/pdf',
          redlineSize: result.size
        };
      }

      const saved = await updateDocument(docId, patch);
      setDocs((list) => upsertLocal(list, saved));
      success(kind === 'main' ? 'PDF uploaded' : 'Redline attached', 'Synced for all devices');
    } catch (err) {
      toastError(
        'Upload failed',
        err instanceof Error ? err.message : 'Could not upload PDF'
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setUploadLabel('');
    }
  }

  async function handleNewWithFile(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const title = form.title.trim();
    if (!title) return;

    const fileInput = newMainFileRef.current;
    const file = fileInput?.files?.[0] || null;

    setSaving(true);
    try {
      const created = await createDocument({
        title,
        description: (form.description || '').trim(),
        status: form.status || 'Draft',
        version: 1,
        uploadedById: user?.id || null,
        uploadedByName: displayName || null
      });
      setDocs((list) => upsertLocal(list, created));
      setSelectedId(created.id);
      setModal(null);

      if (file) {
        setSaving(false);
        await uploadPdf(file, 'main', created.id);
      } else {
        success('Document created', 'Visible on all devices — upload a PDF when ready');
      }
    } catch (err) {
      toastError(
        'Create failed',
        err instanceof Error ? err.message : 'Could not create document'
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: DocumentReviewStatus) {
    if (!canEdit) return;
    try {
      const saved = await updateDocument(id, { status });
      setDocs((list) => upsertLocal(list, saved));
    } catch (err) {
      toastError(
        'Status update failed',
        err instanceof Error ? err.message : 'Could not update status'
      );
    }
  }

  async function deleteDoc(id: string) {
    if (!canEdit) return;
    if (!confirm('Delete this document and its comments from shared storage?')) return;
    try {
      await deleteDocumentApi(id);
      setDocs((list) => list.filter((x) => x.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setCommentBody('');
        setReplyTo(null);
      }
      success('Document deleted', 'Removed for all devices');
    } catch (err) {
      toastError(
        'Delete failed',
        err instanceof Error ? err.message : 'Could not delete document'
      );
    }
  }

  async function clearMainFileMeta(id: string) {
    try {
      const saved = await updateDocument(id, {
        fileName: null,
        fileUrl: null,
        pathname: null,
        mime: null,
        size: null
      });
      setDocs((list) => upsertLocal(list, saved));
    } catch (err) {
      toastError(
        'Update failed',
        err instanceof Error ? err.message : 'Could not clear file'
      );
    }
  }

  async function clearRedlineMeta(id: string) {
    try {
      const saved = await updateDocument(id, {
        redlineFileName: null,
        redlineFileUrl: null,
        redlinePathname: null,
        redlineMime: null,
        redlineSize: null
      });
      setDocs((list) => upsertLocal(list, saved));
    } catch (err) {
      toastError(
        'Update failed',
        err instanceof Error ? err.message : 'Could not clear redline'
      );
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !user?.id) return;
    const body = commentBody.trim();
    if (!body) return;

    try {
      const { document: saved } = await postDocumentComment(selected.id, {
        body,
        parentId: replyTo,
        authorName: displayName
      });
      setDocs((list) => upsertLocal(list, saved));
      setCommentBody('');
      setReplyTo(null);
      success('Comment posted');
    } catch (err) {
      toastError(
        'Comment failed',
        err instanceof Error ? err.message : 'Could not post comment'
      );
    }
  }

  const replyParent = replyTo
    ? selected?.comments.find((c) => c.id === replyTo)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Document Review</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">
            Cloud-synced leases &amp; contracts · threaded comments for every role
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={loading || refreshing}
            onClick={() => void loadLibrary({ soft: true })}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          {canEdit && (
            <button type="button" className="btn-primary btn-sm" onClick={openNew}>
              + Upload document
            </button>
          )}
        </div>
      </div>

      {listError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <strong>Could not load documents.</strong> {listError}
        </div>
      )}

      {!listError && fetchedAt && !loading && (
        <p className="text-[11px] text-ink-dim">
          Shared library · last sync {formatDateTime(fetchedAt)}
          {refreshing ? ' · updating…' : ''}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Total
          </div>
          <div className="mt-1 text-2xl font-bold">{loading ? '—' : docs.length}</div>
        </div>
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Needs review
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-bold text-amber-300">
              {loading ? '—' : needsReviewCount}
            </span>
            {!loading && needsReviewCount > 0 && (
              <span className="badge badge-needs-review">Attention</span>
            )}
          </div>
        </div>
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Under review
          </div>
          <div className="mt-1 text-2xl font-bold">
            {loading ? '—' : docs.filter((d) => d.status === 'Under Review').length}
          </div>
        </div>
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Approved
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-300">
            {loading ? '—' : docs.filter((d) => d.status === 'Approved').length}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 panel p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all' as const, label: 'All' },
              { id: 'needs-review' as const, label: 'Needs Review' },
              ...DOCUMENT_REVIEW_STATUSES.map((s) => ({ id: s, label: s }))
            ] as { id: StatusFilter; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                statusFilter === f.id
                  ? 'bg-amber-400 text-surface-950'
                  : 'bg-surface-700 text-ink-muted hover:bg-surface-600 hover:text-ink'
              }`}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
              {f.id === 'needs-review' && needsReviewCount > 0 ? ` (${needsReviewCount})` : ''}
            </button>
          ))}
        </div>
        <input
          className="input max-w-xs py-2 text-sm"
          placeholder="Search title or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {uploading && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-amber-200">{uploadLabel}</span>
            <span className="text-amber-300 tabular-nums">
              {uploadProgress != null ? `${uploadProgress}%` : '…'}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-900">
            <div
              className="h-full rounded-full bg-amber-400 transition-all"
              style={{ width: `${uploadProgress ?? 8}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="overflow-hidden panel">
          <div className="border-b border-surface-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">
            Documents ({loading ? '…' : filtered.length})
          </div>
          {loading ? (
            <div className="empty-state">Loading shared documents…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              {docs.length === 0
                ? 'No documents yet. Upload a lease, contract, or PDF — it will sync to every device.'
                : 'No documents match this filter.'}
            </div>
          ) : (
            filtered.map((d) => {
              const active = selectedId === d.id;
              const needs = documentNeedsReview(d);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(d.id);
                    setReplyTo(null);
                    setCommentBody('');
                  }}
                  className={`data-row w-full text-left ${
                    active ? '!bg-amber-400/10 ring-1 ring-inset ring-amber-400/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{d.title}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={`badge ${statusBadgeClass(d.status)}`}>{d.status}</span>
                        {needs && (
                          <span className="badge badge-needs-review">Needs Review</span>
                        )}
                        <span className="text-[11px] text-ink-dim">v{d.version}</span>
                        {(d.comments?.length || 0) > 0 && (
                          <span className="text-[11px] text-ink-dim">
                            {d.comments.length} comment{d.comments.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      {d.description && (
                        <p className="mt-1.5 line-clamp-2 text-xs text-ink-dim">{d.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-ink-dim">
                      <div>{formatDateTime(d.updatedAt)}</div>
                      {reviewDocumentFileRef(d) ? (
                        <div className="mt-1 text-emerald-400/80">PDF</div>
                      ) : (
                        <div className="mt-1 text-ink-dim">No file</div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="panel overflow-hidden">
          {!selected ? (
            <div className="empty-state py-16">
              Select a document to view details, files, and comments.
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="border-b border-surface-600 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold leading-snug">{selected.title}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className={`badge ${statusBadgeClass(selected.status)}`}>
                        {selected.status}
                      </span>
                      {documentNeedsReview(selected) && (
                        <span className="badge badge-needs-review">Needs Review</span>
                      )}
                      <span className="badge badge-low">Version {selected.version}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => openEdit(selected)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => void deleteDoc(selected.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                {selected.description && (
                  <p className="mt-3 text-sm text-ink-muted">{selected.description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-dim">
                  {selected.uploadedByName && <span>By {selected.uploadedByName}</span>}
                  <span>Created {formatDateTime(selected.createdAt)}</span>
                  <span>Updated {formatDateTime(selected.updatedAt)}</span>
                </div>
              </div>

              <div className="space-y-4 border-b border-surface-600 px-4 py-4 sm:px-5">
                {canEdit && (
                  <div>
                    <label className="label">Status</label>
                    <select
                      className="input max-w-xs py-2"
                      value={selected.status}
                      disabled={uploading}
                      onChange={(e) =>
                        void updateStatus(selected.id, e.target.value as DocumentReviewStatus)
                      }
                    >
                      {DOCUMENT_REVIEW_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="panel-inset p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-dim">
                      Document PDF
                    </div>
                    {reviewDocumentFileRef(selected) ? (
                      <div className="mt-2 space-y-1.5">
                        <div className="truncate text-sm font-medium">
                          {selected.fileName || 'document.pdf'}
                        </div>
                        <div className="text-[11px] text-ink-dim">
                          {formatBytes(selected.size)} · v{selected.version}
                        </div>
                        <div className="flex flex-col gap-2 pt-1">
                          <DocumentFileActions
                            fileRef={reviewDocumentFileRef(selected)}
                            name={selected.fileName}
                            canEdit={canEdit}
                            openLabel="Open PDF"
                            onDeleted={() => void clearMainFileMeta(selected.id)}
                          />
                          {canEdit && (
                            <>
                              <input
                                ref={mainFileRef}
                                type="file"
                                accept="application/pdf,.pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (f) void uploadPdf(f, 'main', selected.id);
                                }}
                              />
                              <button
                                type="button"
                                className="btn-ghost btn-sm self-start"
                                disabled={uploading}
                                onClick={() => mainFileRef.current?.click()}
                              >
                                Replace PDF
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-xs text-ink-dim">No PDF uploaded yet.</p>
                        {canEdit && (
                          <>
                            <input
                              ref={mainFileRef}
                              type="file"
                              accept="application/pdf,.pdf"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f) void uploadPdf(f, 'main', selected.id);
                              }}
                            />
                            <button
                              type="button"
                              className="btn-primary btn-sm mt-2"
                              disabled={uploading}
                              onClick={() => mainFileRef.current?.click()}
                            >
                              Upload PDF
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="panel-inset p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink-dim">
                      Review notes / redline
                    </div>
                    {reviewDocumentRedlineRef(selected) ? (
                      <div className="mt-2 space-y-1.5">
                        <div className="truncate text-sm font-medium">
                          {selected.redlineFileName || 'redline.pdf'}
                        </div>
                        <div className="text-[11px] text-ink-dim">
                          {formatBytes(selected.redlineSize)}
                        </div>
                        <div className="flex flex-col gap-2 pt-1">
                          <DocumentFileActions
                            fileRef={reviewDocumentRedlineRef(selected)}
                            name={selected.redlineFileName}
                            canEdit={canEdit}
                            openLabel="Open redline"
                            onDeleted={() => void clearRedlineMeta(selected.id)}
                          />
                          {canEdit && (
                            <>
                              <input
                                ref={redlineFileRef}
                                type="file"
                                accept="application/pdf,.pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (f) void uploadPdf(f, 'redline', selected.id);
                                }}
                              />
                              <button
                                type="button"
                                className="btn-ghost btn-sm self-start"
                                disabled={uploading}
                                onClick={() => redlineFileRef.current?.click()}
                              >
                                Replace redline
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-xs text-ink-dim">
                          Optional marked-up PDF with review notes.
                        </p>
                        {canEdit && (
                          <>
                            <input
                              ref={redlineFileRef}
                              type="file"
                              accept="application/pdf,.pdf"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f) void uploadPdf(f, 'redline', selected.id);
                              }}
                            />
                            <button
                              type="button"
                              className="btn-secondary btn-sm mt-2"
                              disabled={uploading}
                              onClick={() => redlineFileRef.current?.click()}
                            >
                              Attach redline PDF
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-4 py-4 sm:px-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold">
                    Comments
                    <span className="ml-1.5 font-normal text-ink-dim">
                      ({selected.comments?.length || 0})
                    </span>
                  </h4>
                  {roleLoaded && (
                    <span className="text-[11px] text-ink-dim">All roles can comment</span>
                  )}
                </div>

                {(selected.comments?.length || 0) === 0 ? (
                  <p className="mb-4 text-sm text-ink-dim">
                    No comments yet. Start the review thread below.
                  </p>
                ) : (
                  <div className="mb-4 max-h-[28rem] overflow-y-auto pr-1">
                    <CommentThread
                      comments={commentTree}
                      parentId={null}
                      depth={0}
                      replyTo={replyTo}
                      onReply={setReplyTo}
                    />
                  </div>
                )}

                <form onSubmit={(e) => void submitComment(e)} className="space-y-2">
                  {replyParent && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">
                      <span className="truncate">
                        Replying to <strong>{replyParent.authorName}</strong>
                      </span>
                      <button
                        type="button"
                        className="btn-ghost btn-sm !py-0.5"
                        onClick={() => setReplyTo(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  <textarea
                    className="input min-h-[5rem]"
                    placeholder={user ? 'Leave a review comment…' : 'Sign in to comment'}
                    value={commentBody}
                    disabled={!user}
                    onChange={(e) => setCommentBody(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn-primary btn-sm"
                    disabled={!user || !commentBody.trim()}
                  >
                    {replyTo ? 'Post reply' : 'Post comment'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={!!modal}
        title={modal === 'new' ? 'New document' : 'Edit document'}
        onClose={() => setModal(null)}
        wide
      >
        <form
          onSubmit={(e) => {
            if (modal === 'new') void handleNewWithFile(e);
            else void saveMeta(e);
          }}
          className="space-y-3"
        >
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              required
              placeholder="e.g. Space lease — main suite"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[4.5rem]"
              placeholder="What should reviewers focus on?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as DocumentReviewStatus })
                }
              >
                {DOCUMENT_REVIEW_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {modal === 'edit' && (
              <div>
                <label className="label">Version</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.version}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      version: Math.max(1, parseInt(e.target.value, 10) || 1)
                    })
                  }
                />
              </div>
            )}
          </div>
          {modal === 'new' && (
            <div>
              <label className="label">PDF (optional)</label>
              <input
                ref={newMainFileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="input py-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface-700 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-ink"
              />
              <p className="mt-1 text-[11px] text-ink-dim">
                Files go to Vercel Blob and metadata syncs to every signed-in device. Max 100MB.
              </p>
            </div>
          )}
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={uploading || saving}
          >
            {saving
              ? 'Saving…'
              : modal === 'new'
                ? 'Create document'
                : 'Save changes'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
