'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import MediaActions from '@/components/MediaActions';
import MediaPreview from '@/components/MediaPreview';
import { useProject } from '@/components/ProjectProvider';
import { useToast } from '@/components/ToastProvider';
import { useUploadManager } from '@/components/UploadManager';
import { useAssignableUsers } from '@/hooks/useAssignableUsers';
import { useRole } from '@/hooks/useRole';
import { formatDate } from '@/lib/dates';
import {
  fetchMediaLibrary,
  MEDIA_LIBRARY_CHANGED,
  saveMediaMeta,
  type CloudMediaAsset
} from '@/lib/media-client';
import { notifyUsers } from '@/lib/notify-client';
import { mediaAssetUrl, type MediaAsset, type MediaDraftStatus } from '@/lib/types';

function formatBytes(n: number) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function statusBadge(status?: MediaDraftStatus | string) {
  const s = status || 'draft';
  if (s === 'published' || s === 'approved') return 'badge-approved';
  if (s === 'in-review') return 'badge-review';
  if (s === 'scheduled') return 'badge-pending';
  return 'badge-low';
}

function isImageMime(mime?: string, name?: string) {
  return (
    (mime || '').startsWith('image/') ||
    Boolean((name || '').match(/\.(jpe?g|png|gif|webp|heic|avif)$/i))
  );
}

function isVideoMime(mime?: string, name?: string) {
  return (
    (mime || '').startsWith('video/') ||
    Boolean((name || '').match(/\.(mp4|mov|webm|avi|m4v)$/i))
  );
}

const emptyAsset = (): MediaAsset => ({
  id: '',
  name: '',
  mime: '',
  size: 0,
  fileUrl: '',
  pathname: '',
  notes: '',
  title: '',
  description: '',
  scheduledDate: '',
  status: 'draft',
  addedAt: new Date().toISOString(),
  assigneeId: null,
  assigneeName: null
});

function asMediaAsset(a: CloudMediaAsset): MediaAsset {
  return {
    id: a.id,
    name: a.name,
    mime: a.mime,
    size: a.size,
    fileUrl: a.fileUrl,
    pathname: a.pathname,
    notes: a.notes || '',
    title: a.title,
    description: a.description,
    scheduledDate: a.scheduledDate,
    status: (a.status as MediaDraftStatus) || 'draft',
    addedAt: a.addedAt,
    assigneeId: a.assigneeId ?? null,
    assigneeName: a.assigneeName ?? null
  };
}

export default function MediaPage() {
  const { setData } = useProject();
  const { canEdit, isLoaded: roleLoaded } = useRole();
  const { users } = useAssignableUsers();
  const { startUpload, activeCount } = useUploadManager();
  const { success, error: toastError } = useToast();

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'other'>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [drag, setDrag] = useState(false);
  const [modal, setModal] = useState<'edit' | null>(null);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [form, setForm] = useState<MediaAsset>(emptyAsset());
  const [savingMeta, setSavingMeta] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManageMedia = roleLoaded;

  const loadLibrary = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    setListError(null);
    try {
      const result = await fetchMediaLibrary();
      if (result.error) {
        setListError(result.error);
        setAssets([]);
      } else {
        setAssets(result.assets.map(asMediaAsset));
        setFetchedAt(result.fetchedAt || new Date().toISOString());
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load Media Library');
      setAssets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  // Refresh when uploads/deletes happen (same tab or other components)
  useEffect(() => {
    const onChange = () => {
      void loadLibrary({ soft: true });
    };
    window.addEventListener(MEDIA_LIBRARY_CHANGED, onChange);
    // Also refresh when tab becomes visible (other device may have uploaded)
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadLibrary({ soft: true });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener(MEDIA_LIBRARY_CHANGED, onChange);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [loadLibrary]);

  // Soft refresh while uploads are finishing
  useEffect(() => {
    if (activeCount === 0) return;
    const t = window.setInterval(() => {
      void loadLibrary({ soft: true });
    }, 4000);
    return () => window.clearInterval(t);
  }, [activeCount, loadLibrary]);

  const filtered = useMemo(() => {
    let list = [...assets];
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.title || '').toLowerCase().includes(q) ||
          (a.notes || '').toLowerCase().includes(q) ||
          (a.description || '').toLowerCase().includes(q) ||
          (a.pathname || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((a) => (a.status || 'draft') === statusFilter);
    }
    if (typeFilter === 'image') {
      list = list.filter((a) => isImageMime(a.mime, a.name));
    } else if (typeFilter === 'video') {
      list = list.filter((a) => isVideoMime(a.mime, a.name));
    } else if (typeFilter === 'other') {
      list = list.filter((a) => !isImageMime(a.mime, a.name) && !isVideoMime(a.mime, a.name));
    }
    return list;
  }, [assets, filter, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const images = assets.filter((a) => isImageMime(a.mime, a.name)).length;
    const videos = assets.filter((a) => isVideoMime(a.mime, a.name)).length;
    const bytes = assets.reduce((s, a) => s + (a.size || 0), 0);
    return { total: assets.length, images, videos, bytes };
  }, [assets]);

  function handleFiles(fileList: FileList | null) {
    if (!canEdit || !fileList) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        startUpload({
          file,
          folder: 'media',
          kind: 'library'
        });
      } catch {
        // startUpload already toasts validation errors
      }
    }
  }

  function removeAssetFromLibrary(id: string) {
    setAssets((list) => list.filter((x) => x.id !== id));
    // Keep local project cache in sync
    setData((d) => ({
      ...d,
      mediaAssets: d.mediaAssets.filter((x) => x.id !== id && x.pathname !== id)
    }));
    if (previewAsset?.id === id) setPreviewAsset(null);
    if (form.id === id) setModal(null);
    void loadLibrary({ soft: true });
  }

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSavingMeta(true);

    try {
      const prev = assets.find((x) => x.id === form.id);
      const assignee = users.find((u) => u.id === form.assigneeId);
      const next: MediaAsset = {
        ...form,
        title: (form.title || form.name).trim(),
        description: (form.description || form.notes || '').trim(),
        notes: (form.description || form.notes || '').trim(),
        status: form.status || 'draft',
        assigneeId: form.assigneeId || null,
        assigneeName: form.assigneeId ? assignee?.displayName || form.assigneeName || null : null
      };

      if (!next.fileUrl && !next.pathname) {
        toastError('Missing file', 'This asset has no cloud file. Re-upload it.');
        setSavingMeta(false);
        return;
      }

      await saveMediaMeta({
        pathname: next.pathname,
        url: next.fileUrl,
        title: next.title,
        description: next.description,
        notes: next.notes,
        scheduledDate: next.scheduledDate,
        status: next.status,
        assigneeId: next.assigneeId,
        assigneeName: next.assigneeName,
        name: next.name,
        mime: next.mime
      });

      setAssets((list) => list.map((x) => (x.id === next.id ? next : x)));
      setData((d) => ({
        ...d,
        mediaAssets: d.mediaAssets.some((x) => x.id === next.id || x.pathname === next.pathname)
          ? d.mediaAssets.map((x) =>
              x.id === next.id || x.pathname === next.pathname ? next : x
            )
          : [...d.mediaAssets, next]
      }));

      const status = next.status || 'draft';
      const enteredReview = status === 'in-review' && prev?.status !== 'in-review';
      const assigneeChanged = Boolean(next.assigneeId && next.assigneeId !== prev?.assigneeId);
      const needsNotify =
        Boolean(next.assigneeId) && (enteredReview || (assigneeChanged && status === 'in-review'));

      if (needsNotify && next.assigneeId) {
        await notifyUsers({
          userIds: [next.assigneeId],
          type: 'media',
          title: next.title || next.name,
          message: `Media asset needs your attention (${status}). Review it in the Project Hub.`
        });
      }

      success('Metadata saved', next.title || next.name);
      setModal(null);
      void loadLibrary({ soft: true });
    } catch (err) {
      toastError('Save failed', err instanceof Error ? err.message : 'Could not save metadata');
    } finally {
      setSavingMeta(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">Media Library</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">
            Synced from private Vercel Blob · same files on every device · signed preview &amp;
            download
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={loading || refreshing}
            onClick={() => void loadLibrary({ soft: true })}
            title="Refresh from cloud"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          {canEdit && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload files
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Total files
          </div>
          <div className="mt-1 text-2xl font-bold text-ink">{stats.total}</div>
        </div>
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Images
          </div>
          <div className="mt-1 text-2xl font-bold text-ink">{stats.images}</div>
        </div>
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Videos
          </div>
          <div className="mt-1 text-2xl font-bold text-ink">{stats.videos}</div>
        </div>
        <div className="metric-card">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Cloud size
          </div>
          <div className="mt-1 text-2xl font-bold text-ink">{formatBytes(stats.bytes)}</div>
        </div>
      </div>

      {canEdit && (
        <div
          className={`dropzone ${drag ? 'dropzone-active' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="mb-2 text-3xl opacity-60">⇪</div>
          <p className="text-sm font-semibold text-amber-300">Drag & drop files here</p>
          <p className="mt-1 text-xs text-ink-dim">
            Images & videos up to 100MB · stored in private Vercel Blob · visible on all devices
          </p>
          {activeCount > 0 && (
            <p className="mt-2 text-xs font-semibold text-sky-300">
              {activeCount} upload{activeCount === 1 ? '' : 's'} in progress — see panel (bottom
              left)
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {/* Filters */}
      <div className="panel space-y-3 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="search"
            className="input sm:col-span-2 lg:col-span-1"
            placeholder="Search title, file, notes…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="draft">draft</option>
            <option value="scheduled">scheduled</option>
            <option value="in-review">in-review</option>
            <option value="approved">approved</option>
            <option value="published">published</option>
          </select>
          <select
            className="input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          >
            <option value="all">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="other">Other</option>
          </select>
          <div className="flex items-center gap-1 rounded-lg border border-surface-600 bg-surface-950 p-1">
            <button
              type="button"
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                view === 'grid' ? 'bg-amber-400 text-surface-950' : 'text-ink-muted hover:text-ink'
              }`}
              onClick={() => setView('grid')}
            >
              Grid
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                view === 'list' ? 'bg-amber-400 text-surface-950' : 'text-ink-muted hover:text-ink'
              }`}
              onClick={() => setView('list')}
            >
              List
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-dim">
          <span>
            Showing {filtered.length} of {assets.length} cloud file
            {assets.length === 1 ? '' : 's'}
            {fetchedAt && (
              <>
                {' '}
                · Updated {new Date(fetchedAt).toLocaleTimeString()}
              </>
            )}
          </span>
          {listError && <span className="text-red-300">{listError}</span>}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="panel empty-state">
          <div className="mx-auto mb-2 h-6 w-6 animate-pulse rounded-full bg-surface-600" />
          Loading Media Library from cloud…
        </div>
      ) : listError && assets.length === 0 ? (
        <div className="panel empty-state space-y-3">
          <p className="text-red-300">{listError}</p>
          <button
            type="button"
            className="btn-secondary btn-sm mx-auto"
            onClick={() => void loadLibrary()}
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel empty-state">
          {activeCount > 0
            ? 'Upload in progress — files appear here when complete (all devices).'
            : assets.length === 0
              ? 'No media in cloud yet. Upload files to sync across phone, tablet, and desktop.'
              : 'No files match your filters.'}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((a) => {
            const ref = mediaAssetUrl(a);
            const cloudRef = a.fileUrl || a.pathname || '';
            return (
              <div
                key={a.id}
                className="panel group flex flex-col overflow-hidden transition hover:border-amber-400/40"
              >
                <button
                  type="button"
                  className="relative aspect-[4/3] w-full overflow-hidden bg-surface-950"
                  onClick={() => setPreviewAsset(a)}
                  title="Preview"
                >
                  <MediaPreview
                    url={ref}
                    mime={a.mime}
                    name={a.name}
                    className="h-full w-full rounded-none border-0 object-cover"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8">
                    <span className={`badge ${statusBadge(a.status)}`}>{a.status || 'draft'}</span>
                  </div>
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">
                      {a.title || a.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-ink-dim">
                      {a.mime || 'file'} · {formatBytes(a.size)} ·{' '}
                      {formatDate(a.addedAt?.slice(0, 10) || '')}
                    </div>
                    {a.assigneeName && (
                      <span className="badge badge-role mt-1.5">{a.assigneeName}</span>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5 border-t border-surface-600 pt-2">
                    <MediaActions
                      fileUrl={cloudRef || ref}
                      name={a.name}
                      mime={a.mime}
                      canDelete={canManageMedia && Boolean(cloudRef || ref)}
                      onPreview={() => setPreviewAsset(a)}
                      onDeleted={() => removeAssetFromLibrary(a.id)}
                    />
                    {canEdit && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          setForm({ ...emptyAsset(), ...a });
                          setModal('edit');
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden panel">
          {filtered.map((a) => {
            const ref = mediaAssetUrl(a);
            const cloudRef = a.fileUrl || a.pathname || '';
            return (
              <div
                key={a.id}
                className="data-row grid grid-cols-1 items-center gap-3 sm:grid-cols-[auto_1fr_auto]"
              >
                <button
                  type="button"
                  className="justify-self-start"
                  onClick={() => setPreviewAsset(a)}
                  title="Preview"
                >
                  <MediaPreview url={ref} mime={a.mime} name={a.name} className="h-16 w-16" />
                </button>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.title || a.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-dim">
                    <span className={`badge ${statusBadge(a.status)}`}>{a.status || 'draft'}</span>
                    <span>
                      {a.mime || 'file'} · {formatBytes(a.size)}
                    </span>
                    <span>· {formatDate(a.addedAt?.slice(0, 10) || '')}</span>
                    {a.scheduledDate && <span>· Sched {formatDate(a.scheduledDate)}</span>}
                    {a.assigneeName && <span className="badge badge-role">{a.assigneeName}</span>}
                    <span className="text-emerald-400/80">Cloud</span>
                  </div>
                  {(a.description || a.notes) && (
                    <p className="mt-1 line-clamp-1 text-xs text-ink-dim">
                      {a.description || a.notes}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                  <MediaActions
                    fileUrl={cloudRef || ref}
                    name={a.name}
                    mime={a.mime}
                    canDelete={canManageMedia && Boolean(cloudRef || ref)}
                    onPreview={() => setPreviewAsset(a)}
                    onDeleted={() => removeAssetFromLibrary(a.id)}
                  />
                  {canEdit && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm self-end"
                      onClick={() => {
                        setForm({ ...emptyAsset(), ...a });
                        setModal('edit');
                      }}
                    >
                      Edit details
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full preview modal */}
      <Modal
        open={!!previewAsset}
        title={previewAsset?.title || previewAsset?.name || 'Preview'}
        onClose={() => setPreviewAsset(null)}
      >
        {previewAsset && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-surface-600 bg-surface-950">
              <MediaPreview
                url={mediaAssetUrl(previewAsset)}
                mime={previewAsset.mime}
                name={previewAsset.name}
                className="mx-auto h-auto max-h-[60vh] w-full max-w-full object-contain"
                controls
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-600 pt-3">
              <p className="text-xs text-ink-dim">
                {previewAsset.mime} · {formatBytes(previewAsset.size)}
                {previewAsset.pathname ? ` · ${previewAsset.pathname}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {canEdit && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setForm({ ...emptyAsset(), ...previewAsset });
                      setModal('edit');
                      setPreviewAsset(null);
                    }}
                  >
                    Edit details
                  </button>
                )}
                <MediaActions
                  fileUrl={
                    previewAsset.fileUrl || previewAsset.pathname || mediaAssetUrl(previewAsset)
                  }
                  name={previewAsset.name}
                  mime={previewAsset.mime}
                  canDelete={canManageMedia}
                  onDeleted={() => {
                    removeAssetFromLibrary(previewAsset.id);
                    setPreviewAsset(null);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modal === 'edit'} title="Edit media asset" onClose={() => setModal(null)}>
        <form onSubmit={(e) => void saveMeta(e)} className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              required
              value={form.title || form.name}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[5rem]"
              value={form.description || form.notes || ''}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value, notes: e.target.value })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Scheduled date</label>
              <input
                type="date"
                className="input"
                value={form.scheduledDate || ''}
                onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={form.status || 'draft'}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as MediaDraftStatus })
                }
              >
                <option value="draft">draft</option>
                <option value="scheduled">scheduled</option>
                <option value="in-review">in-review</option>
                <option value="approved">approved</option>
                <option value="published">published</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Assign reviewer</label>
            <select
              className="input"
              value={form.assigneeId || ''}
              onChange={(e) => {
                const id = e.target.value || null;
                const u = users.find((x) => x.id === id);
                setForm({
                  ...form,
                  assigneeId: id,
                  assigneeName: u?.displayName || null
                });
              }}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </div>
          {mediaAssetUrl(form) && (
            <div className="panel-inset p-3">
              <p className="mb-2 text-xs font-semibold text-ink-muted">Preview</p>
              <MediaPreview
                url={mediaAssetUrl(form)}
                mime={form.mime}
                name={form.name}
                className="h-32 w-full max-w-xs"
              />
            </div>
          )}
          <p className="text-[11px] text-ink-dim">
            Metadata is stored in cloud and syncs to every device.
          </p>
          <button type="submit" className="btn-primary w-full" disabled={savingMeta}>
            {savingMeta ? 'Saving…' : 'Save metadata'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
