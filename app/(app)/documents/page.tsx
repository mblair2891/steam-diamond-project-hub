'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import SignedMediaLink from '@/components/SignedMediaLink';
import { useProject } from '@/components/ProjectProvider';
import { useToast } from '@/components/ToastProvider';
import { useRole } from '@/hooks/useRole';
import { uploadToBlob } from '@/lib/blob-upload';
import { uid } from '@/lib/dates';
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

/** Build parent → children tree for threaded display */
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

export default function DocumentsPage() {
  const { data, setData, addDocumentComment } = useProject();
  const { canEdit, user, displayName, isLoaded: roleLoaded } = useRole();
  const { success, error: toastError } = useToast();

  const docs = data.reviewDocuments || [];

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'new' | 'edit' | null>(null);
  const [form, setForm] = useState<ReviewDocument>(emptyDoc());

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploading, setUploading] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const mainFileRef = useRef<HTMLInputElement>(null);
  const redlineFileRef = useRef<HTMLInputElement>(null);
  const newMainFileRef = useRef<HTMLInputElement>(null);

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

  function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const title = form.title.trim();
    if (!title) return;

    const now = new Date().toISOString();
    const isNew = modal === 'new' || !form.id;

    const next: ReviewDocument = {
      ...form,
      id: form.id || uid('rd'),
      title,
      description: (form.description || '').trim(),
      status: form.status || 'Draft',
      version: form.version || 1,
      comments: form.comments || [],
      createdAt: form.createdAt || now,
      updatedAt: now,
      uploadedById: form.uploadedById || user?.id || null,
      uploadedByName: form.uploadedByName || displayName || null
    };

    setData((d) => {
      const list = [...(d.reviewDocuments || [])];
      const idx = list.findIndex((x) => x.id === next.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...next, comments: list[idx].comments };
      else list.push(next);
      return { ...d, reviewDocuments: list };
    });

    setSelectedId(next.id);
    setModal(null);
    success(isNew ? 'Document created' : 'Document updated');
  }

  async function uploadPdf(
    file: File,
    kind: 'main' | 'redline',
    docId: string
  ): Promise<void> {
    if (!canEdit) return;
    if (!isPdfFile(file)) {
      toastError('Please upload a PDF file.');
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

      const now = new Date().toISOString();
      setData((d) => {
        const list = [...(d.reviewDocuments || [])];
        const idx = list.findIndex((x) => x.id === docId);
        if (idx < 0) return d;
        const prev = list[idx];
        let next: ReviewDocument;
        if (kind === 'main') {
          const bumpVersion = Boolean(prev.fileUrl || prev.pathname);
          next = {
            ...prev,
            fileName: result.name || file.name,
            fileUrl: result.url,
            pathname: result.pathname,
            mime: result.contentType || 'application/pdf',
            size: result.size,
            version: bumpVersion ? (prev.version || 1) + 1 : prev.version || 1,
            updatedAt: now,
            uploadedById: user?.id || prev.uploadedById || null,
            uploadedByName: displayName || prev.uploadedByName || null
          };
        } else {
          next = {
            ...prev,
            redlineFileName: result.name || file.name,
            redlineFileUrl: result.url,
            redlinePathname: result.pathname,
            redlineMime: result.contentType || 'application/pdf',
            redlineSize: result.size,
            updatedAt: now
          };
        }
        list[idx] = next;
        return { ...d, reviewDocuments: list };
      });

      success(kind === 'main' ? 'PDF uploaded' : 'Redline attached');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Upload failed');
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
    const now = new Date().toISOString();
    const id = uid('rd');

    let next: ReviewDocument = {
      ...emptyDoc(),
      id,
      title,
      description: (form.description || '').trim(),
      status: form.status || 'Draft',
      version: 1,
      createdAt: now,
      updatedAt: now,
      uploadedById: user?.id || null,
      uploadedByName: displayName || null
    };

    setData((d) => ({
      ...d,
      reviewDocuments: [...(d.reviewDocuments || []), next]
    }));
    setSelectedId(id);
    setModal(null);

    if (file) {
      await uploadPdf(file, 'main', id);
    } else {
      success('Document created — upload a PDF when ready');
    }
  }

  function updateStatus(id: string, status: DocumentReviewStatus) {
    if (!canEdit) return;
    setData((d) => ({
      ...d,
      reviewDocuments: (d.reviewDocuments || []).map((x) =>
        x.id === id ? { ...x, status, updatedAt: new Date().toISOString() } : x
      )
    }));
  }

  function deleteDoc(id: string) {
    if (!canEdit) return;
    if (!confirm('Delete this document and its comments?')) return;
    setData((d) => ({
      ...d,
      reviewDocuments: (d.reviewDocuments || []).filter((x) => x.id !== id)
    }));
    if (selectedId === id) {
      setSelectedId(null);
      setCommentBody('');
      setReplyTo(null);
    }
    success('Document deleted');
  }

  function clearRedline(id: string) {
    if (!canEdit) return;
    if (!confirm('Remove the attached redline PDF?')) return;
    setData((d) => ({
      ...d,
      reviewDocuments: (d.reviewDocuments || []).map((x) =>
        x.id === id
          ? {
              ...x,
              redlineFileName: null,
              redlineFileUrl: null,
              redlinePathname: null,
              redlineMime: null,
              redlineSize: null,
              updatedAt: new Date().toISOString()
            }
          : x
      )
    }));
    success('Redline removed');
  }

  function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !user?.id) return;
    const body = commentBody.trim();
    if (!body) return;

    addDocumentComment(selected.id, {
      parentId: replyTo,
      authorId: user.id,
      authorName: displayName,
      body
    });
    setCommentBody('');
    setReplyTo(null);
    success('Comment posted');
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
            Leases, contracts, and PDFs · threaded comments for every role
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn-primary btn-sm" onClick={openNew}>
            + Upload document
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Total
          </div>
          <div className="mt-1 text-2xl font-bold">{docs.length}</div>
        </div>
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Needs review
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-bold text-amber-300">{needsReviewCount}</span>
            {needsReviewCount > 0 && (
              <span className="badge badge-needs-review">Attention</span>
            )}
          </div>
        </div>
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Under review
          </div>
          <div className="mt-1 text-2xl font-bold">
            {docs.filter((d) => d.status === 'Under Review').length}
          </div>
        </div>
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Approved
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-300">
            {docs.filter((d) => d.status === 'Approved').length}
          </div>
        </div>
      </div>

      {/* Filters */}
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
        {/* List */}
        <div className="overflow-hidden panel">
          <div className="border-b border-surface-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-dim">
            Documents ({filtered.length})
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              {docs.length === 0
                ? 'No documents yet. Upload a lease, contract, or PDF to start review.'
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

        {/* Detail */}
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
                        onClick={() => deleteDoc(selected.id)}
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

              {/* Status + files */}
              <div className="space-y-4 border-b border-surface-600 px-4 py-4 sm:px-5">
                {canEdit && (
                  <div>
                    <label className="label">Status</label>
                    <select
                      className="input max-w-xs py-2"
                      value={selected.status}
                      disabled={uploading}
                      onChange={(e) =>
                        updateStatus(selected.id, e.target.value as DocumentReviewStatus)
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
                  {/* Main PDF */}
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
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <SignedMediaLink
                            url={reviewDocumentFileRef(selected)}
                            name={selected.fileName || undefined}
                            className="btn-secondary btn-sm"
                          >
                            Open PDF
                          </SignedMediaLink>
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
                                className="btn-ghost btn-sm"
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

                  {/* Redline */}
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
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <SignedMediaLink
                            url={reviewDocumentRedlineRef(selected)}
                            name={selected.redlineFileName || undefined}
                            className="btn-secondary btn-sm"
                          >
                            Open redline
                          </SignedMediaLink>
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
                                className="btn-ghost btn-sm"
                                disabled={uploading}
                                onClick={() => redlineFileRef.current?.click()}
                              >
                                Replace
                              </button>
                              <button
                                type="button"
                                className="btn-danger"
                                disabled={uploading}
                                onClick={() => clearRedline(selected.id)}
                              >
                                Remove
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

              {/* Comments — all roles */}
              <div className="px-4 py-4 sm:px-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold">
                    Comments
                    <span className="ml-1.5 font-normal text-ink-dim">
                      ({selected.comments?.length || 0})
                    </span>
                  </h4>
                  {roleLoaded && (
                    <span className="text-[11px] text-ink-dim">
                      All roles can comment
                    </span>
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

                <form onSubmit={submitComment} className="space-y-2">
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
                    placeholder={
                      user
                        ? 'Leave a review comment…'
                        : 'Sign in to comment'
                    }
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

      {/* Create / Edit modal */}
      <Modal
        open={!!modal}
        title={modal === 'new' ? 'New document' : 'Edit document'}
        onClose={() => setModal(null)}
        wide
      >
        <form
          onSubmit={(e) => {
            if (modal === 'new') void handleNewWithFile(e);
            else saveMeta(e);
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
                You can also attach the PDF after creating the document. Max 100MB.
              </p>
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={uploading}>
            {modal === 'new' ? 'Create document' : 'Save changes'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
