'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import MediaActions from '@/components/MediaActions';
import MediaPreview from '@/components/MediaPreview';
import { useProject } from '@/components/ProjectProvider';
import { useToast } from '@/components/ToastProvider';
import { useUploadManager } from '@/components/UploadManager';
import { useAssignableUsers } from '@/hooks/useAssignableUsers';
import { useRole } from '@/hooks/useRole';
import { formatDate } from '@/lib/dates';
import { notifyUsers } from '@/lib/notify-client';
import { mediaAssetUrl, type MediaAsset, type MediaDraftStatus } from '@/lib/types';

function formatBytes(n: number) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function statusBadge(status?: MediaDraftStatus) {
  const s = status || 'draft';
  if (s === 'published' || s === 'approved') return 'badge-approved';
  if (s === 'in-review') return 'badge-review';
  if (s === 'scheduled') return 'badge-pending';
  return 'badge-low';
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

export default function MediaPage() {
  const { data, setData } = useProject();
  const { canEdit, isLoaded: roleLoaded } = useRole();
  const { users } = useAssignableUsers();
  const { startUpload, activeCount } = useUploadManager();
  const { success, error: toastError } = useToast();
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [drag, setDrag] = useState(false);
  const [modal, setModal] = useState<'edit' | null>(null);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [form, setForm] = useState<MediaAsset>(emptyAsset());
  const [savingMeta, setSavingMeta] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Any signed-in user may preview / download / delete media
  const canManageMedia = roleLoaded;

  const assets = useMemo(() => {
    let list = [...data.mediaAssets].reverse();
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.title || '').toLowerCase().includes(q) ||
          (a.notes || '').toLowerCase().includes(q) ||
          (a.description || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((a) => (a.status || 'draft') === statusFilter);
    }
    return list;
  }, [data.mediaAssets, filter, statusFilter]);

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
    setData((d) => ({
      ...d,
      mediaAssets: d.mediaAssets.filter((x) => x.id !== id)
    }));
    if (previewAsset?.id === id) setPreviewAsset(null);
    if (form.id === id) setModal(null);
  }

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSavingMeta(true);

    try {
      const prev = data.mediaAssets.find((x) => x.id === form.id);
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

      if (!next.fileUrl && !next.dataUrl && !next.pathname) {
        toastError('Missing file', 'This asset has no cloud file. Re-upload it.');
        setSavingMeta(false);
        return;
      }

      setData((d) => ({
        ...d,
        mediaAssets: d.mediaAssets.map((x) => (x.id === next.id ? next : x))
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
    } catch (err) {
      toastError('Save failed', err instanceof Error ? err.message : 'Could not save metadata');
    } finally {
      setSavingMeta(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="section-title">Media Library</h2>
        <p className="ml-3 mt-1 text-sm text-ink-muted">
          Private cloud storage · temporary signed URLs for preview &amp; download · delete with
          confirmation
        </p>
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
            Images & videos up to 100MB · stored privately in Vercel Blob
          </p>
          {activeCount > 0 && (
            <p className="mt-2 text-xs font-semibold text-sky-300">
              {activeCount} upload{activeCount === 1 ? '' : 's'} in progress — see panel (bottom left)
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

      <div className="panel grid gap-2 p-3 sm:grid-cols-2">
        <input
          type="search"
          className="input"
          placeholder="Filter assets…"
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
      </div>

      <div className="overflow-hidden panel">
        {assets.length === 0 ? (
          <div className="empty-state">
            {activeCount > 0
              ? 'Upload in progress — assets appear here when complete.'
              : 'No media assets yet'}
          </div>
        ) : (
          assets.map((a) => {
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
                  <MediaPreview url={ref} mime={a.mime} name={a.name} />
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
                    {cloudRef && <span className="text-emerald-400/80">Private cloud</span>}
                    {!cloudRef && a.dataUrl && (
                      <span className="text-amber-300/70">Local only</span>
                    )}
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
          })
        )}
      </div>

      {/* Full preview modal */}
      <Modal
        open={!!previewAsset}
        title={previewAsset?.title || previewAsset?.name || 'Preview'}
        onClose={() => setPreviewAsset(null)}
      >
        {previewAsset && (
          <div className="space-y-4">
            <MediaPreview
              url={mediaAssetUrl(previewAsset)}
              mime={previewAsset.mime}
              name={previewAsset.name}
              className="mx-auto h-auto max-h-[60vh] w-full max-w-full object-contain"
              controls
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-600 pt-3">
              <p className="text-xs text-ink-dim">
                {previewAsset.mime} · {formatBytes(previewAsset.size)}
                {previewAsset.pathname ? ` · ${previewAsset.pathname}` : ''}
              </p>
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
          <button type="submit" className="btn-primary w-full" disabled={savingMeta}>
            {savingMeta ? 'Saving…' : 'Save metadata'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
