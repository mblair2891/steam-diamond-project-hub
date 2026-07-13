'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import MediaPreview from '@/components/MediaPreview';
import UploadProgress from '@/components/UploadProgress';
import { useProject } from '@/components/ProjectProvider';
import { useAssignableUsers } from '@/hooks/useAssignableUsers';
import { useRole } from '@/hooks/useRole';
import { uploadToBlob } from '@/lib/blob-upload';
import { downloadBlob, formatDate, parseLocalDate, toISODate, uid } from '@/lib/dates';
import { notifyUsers } from '@/lib/notify-client';
import { exportCalendarCSV } from '@/lib/storage';
import type { MediaDraftStatus, MediaEvent, MediaEventType } from '@/lib/types';

function emptyEvent(): MediaEvent {
  return {
    id: '',
    title: '',
    date: toISODate(new Date()),
    type: 'post',
    channel: 'Instagram',
    notes: '',
    status: 'draft',
    fileUrl: null,
    fileName: null,
    mime: null,
    size: null,
    assigneeId: null,
    assigneeName: null
  };
}

function statusBadge(status?: MediaDraftStatus) {
  const s = status || 'draft';
  if (s === 'published' || s === 'approved') return 'badge-approved';
  if (s === 'in-review') return 'badge-review';
  if (s === 'scheduled') return 'badge-pending';
  return 'badge-low';
}

export default function CalendarPage() {
  const { data, setData, getKeysDate } = useProject();
  const { canEdit } = useRole();
  const { users } = useAssignableUsers();
  const keys = parseLocalDate(getKeysDate());
  const [month, setMonth] = useState({ y: keys.getFullYear(), m: keys.getMonth() });
  const [modal, setModal] = useState<'new' | 'edit' | null>(null);
  const [form, setForm] = useState<MediaEvent>(emptyEvent());
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const { y, m } = month;
  const first = new Date(y, m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayIso = toISODate(new Date());

  const eventsByDate = useMemo(() => {
    const map: Record<string, MediaEvent[]> = {};
    data.mediaEvents.forEach((ev) => {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    });
    return map;
  }, [data.mediaEvents]);

  const cells: { date: string; other: boolean; num: number }[] = [];
  for (let i = 0; i < startPad; i++) {
    const d = new Date(y, m, -startPad + i + 1);
    cells.push({ date: toISODate(d), other: true, num: d.getDate() });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: toISODate(new Date(y, m, d)), other: false, num: d });
  }
  while (cells.length % 7 !== 0) {
    const n = cells.length - startPad - daysInMonth + 1;
    const d = new Date(y, m + 1, n);
    cells.push({ date: toISODate(d), other: true, num: d.getDate() });
  }

  const list = useMemo(() => {
    let items = [...data.mediaEvents].sort((a, b) => a.date.localeCompare(b.date));
    if (filterStatus !== 'all') {
      items = items.filter((e) => (e.status || 'scheduled') === filterStatus);
    }
    return items;
  }, [data.mediaEvents, filterStatus]);

  function openNew(date?: string) {
    setError('');
    setUploadPct(null);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setForm({
      ...emptyEvent(),
      date: date || toISODate(new Date())
    });
    setModal('new');
  }

  function openEdit(e: MediaEvent) {
    setError('');
    setUploadPct(null);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setForm({ ...emptyEvent(), ...e });
    setModal('edit');
  }

  async function onPickFile(file: File | null) {
    if (!file || !canEdit) return;
    setError('');
    if (file.size > 100 * 1024 * 1024) {
      setError('File too large (max 100MB)');
      return;
    }

    const preview = URL.createObjectURL(file);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(preview);
    setUploadPct(0);

    try {
      const result = await uploadToBlob({
        file,
        folder: 'blitz',
        onProgress: (pct) => setUploadPct(pct)
      });

      setForm((f) => ({
        ...f,
        fileUrl: result.url,
        fileName: result.name,
        mime: result.contentType,
        size: result.size,
        type:
          result.contentType.startsWith('video/')
            ? 'video'
            : result.contentType.startsWith('image/') && f.type === 'post'
              ? 'image'
              : f.type
      }));
      setUploadPct(100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      setUploadPct(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError('');

    const prev = data.mediaEvents.find((x) => x.id === form.id);
    const assignee = users.find((u) => u.id === form.assigneeId);
    const next: MediaEvent = {
      ...form,
      id: form.id || uid('me'),
      title: form.title.trim(),
      notes: form.notes.trim(),
      status: form.status || 'draft',
      assigneeId: form.assigneeId || null,
      assigneeName: form.assigneeId
        ? assignee?.displayName || form.assigneeName || null
        : null
    };

    setData((d) => {
      const idx = d.mediaEvents.findIndex((x) => x.id === next.id);
      const mediaEvents = [...d.mediaEvents];
      if (idx >= 0) mediaEvents[idx] = next;
      else mediaEvents.push(next);
      return { ...d, mediaEvents };
    });

    const status = next.status || 'draft';
    const enteredReview = status === 'in-review' && prev?.status !== 'in-review';
    const assigneeChanged = Boolean(next.assigneeId && next.assigneeId !== prev?.assigneeId);
    const needsNotify =
      Boolean(next.assigneeId) && (enteredReview || (assigneeChanged && status === 'in-review'));

    if (needsNotify && next.assigneeId) {
      await notifyUsers({
        userIds: [next.assigneeId],
        type: 'media',
        title: next.title,
        message: `Media blitz item (${status}) needs your review. Scheduled ${next.date}.`
      });
    }

    setSaving(false);
    setModal(null);
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
    }
    setUploadPct(null);
  }

  const previewUrl = localPreview || form.fileUrl || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Media Blitz</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">
            Content calendar · drafts · uploads · review workflow
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button type="button" className="btn-primary btn-sm" onClick={() => openNew()}>
              + Draft / Event
            </button>
          )}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() =>
              downloadBlob(
                'steam-diamond-media-calendar.csv',
                exportCalendarCSV(data.mediaEvents),
                'text/csv;charset=utf-8'
              )
            }
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="panel p-3 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            className="btn-ghost text-xl"
            onClick={() => {
              let { y, m } = month;
              m--;
              if (m < 0) {
                m = 11;
                y--;
              }
              setMonth({ y, m });
            }}
          >
            ‹
          </button>
          <h3 className="text-base font-bold text-amber-300">{monthLabel}</h3>
          <button
            type="button"
            className="btn-ghost text-xl"
            onClick={() => {
              let { y, m } = month;
              m++;
              if (m > 11) {
                m = 0;
                y++;
              }
              setMonth({ y, m });
            }}
          >
            ›
          </button>
        </div>
        <div className="cal-grid mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div
              key={d}
              className="py-1 text-center text-[11px] font-bold uppercase tracking-wide text-ink-dim"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="cal-grid">
          {cells.map((c) => {
            const evs = eventsByDate[c.date] || [];
            return (
              <div
                key={c.date + c.num}
                className={`cal-day ${c.other ? 'other' : ''} ${c.date === todayIso ? 'today' : ''}`}
                onClick={() => canEdit && openNew(c.date)}
              >
                <div className="mb-1 text-xs font-semibold text-ink-muted">{c.num}</div>
                {evs.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className={`cal-event ${e.type} ${e.status === 'draft' ? 'opacity-70' : ''}`}
                    title={`${e.title} (${e.status || 'scheduled'})`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      openEdit(e);
                    }}
                  >
                    {e.title}
                  </div>
                ))}
                {evs.length > 3 && <div className="text-[10px] text-ink-dim">+{evs.length - 3}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden panel">
        <div className="flex flex-col gap-2 border-b border-surface-600 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide">All drafts & events</h3>
          <div className="flex items-center gap-2">
            <select
              className="input !w-auto py-1.5 text-xs"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="draft">draft</option>
              <option value="scheduled">scheduled</option>
              <option value="in-review">in-review</option>
              <option value="approved">approved</option>
              <option value="published">published</option>
            </select>
            <span className="text-xs text-ink-dim">{list.length} items</span>
          </div>
        </div>
        {list.length === 0 ? (
          <div className="empty-state">No items match this filter</div>
        ) : (
          list.map((e) => (
            <div
              key={e.id}
              className="data-row grid grid-cols-1 gap-3 sm:grid-cols-[auto_100px_1fr_auto] sm:items-center"
            >
              <MediaPreview
                url={e.fileUrl}
                mime={e.mime}
                name={e.fileName || e.title}
                className="h-12 w-12"
              />
              <div className="text-xs font-semibold text-amber-300">{formatDate(e.date)}</div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{e.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-dim">
                  <span className={`badge ${statusBadge(e.status)}`}>{e.status || 'scheduled'}</span>
                  <span className="capitalize">
                    {e.type} · {e.channel || '—'}
                  </span>
                  {e.assigneeName && <span className="badge badge-role">{e.assigneeName}</span>}
                  {e.fileUrl && <span className="text-emerald-400/80">Has media</span>}
                </div>
                {e.notes && <p className="mt-1 line-clamp-1 text-xs text-ink-dim">{e.notes}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => openEdit(e)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => {
                      if (confirm('Delete event?')) {
                        setData((d) => ({
                          ...d,
                          mediaEvents: d.mediaEvents.filter((x) => x.id !== e.id)
                        }));
                      }
                    }}
                  >
                    Del
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Modal
        open={!!modal}
        title={modal === 'new' ? 'New media draft' : 'Edit media item'}
        onClose={() => {
          setModal(null);
          setUploadPct(null);
          if (localPreview) {
            URL.revokeObjectURL(localPreview);
            setLocalPreview(null);
          }
        }}
      >
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Post or video title"
            />
          </div>
          <div>
            <label className="label">Description / caption</label>
            <textarea
              className="input min-h-[5rem]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Caption, talking points, creative brief…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Scheduled date</label>
              <input
                type="date"
                className="input"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as MediaEventType })}
              >
                <option value="post">post</option>
                <option value="image">image</option>
                <option value="video">video</option>
                <option value="announcement">announcement</option>
                <option value="event">event</option>
              </select>
            </div>
            <div>
              <label className="label">Channel</label>
              <input
                className="input"
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
              />
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

          {canEdit && (
            <div>
              <label className="label">Media file (image / video)</label>
              <div
                className="dropzone !p-4"
                onClick={() => fileRef.current?.click()}
                onDragOver={(ev) => ev.preventDefault()}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const f = ev.dataTransfer.files?.[0];
                  if (f) void onPickFile(f);
                }}
              >
                <p className="text-sm font-semibold text-amber-300">
                  {form.fileName || 'Upload video or image'}
                </p>
                <p className="mt-1 text-xs text-ink-dim">
                  Stored in Vercel Blob · click or drop
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*"
                  onChange={(ev) => {
                    const f = ev.target.files?.[0] || null;
                    void onPickFile(f);
                    ev.target.value = '';
                  }}
                />
              </div>
              {uploadPct !== null && uploadPct < 100 && (
                <div className="mt-2">
                  <UploadProgress
                    label={form.fileName || 'Uploading…'}
                    progress={uploadPct}
                    previewUrl={localPreview}
                    mime={form.mime}
                  />
                </div>
              )}
              {previewUrl && (uploadPct === null || uploadPct >= 100) && (
                <div className="mt-2 panel-inset p-3">
                  <p className="mb-2 text-xs font-semibold text-ink-muted">Preview</p>
                  <MediaPreview
                    url={previewUrl}
                    mime={form.mime}
                    name={form.fileName || form.title}
                    className="h-36 w-full max-w-sm"
                  />
                  {form.fileUrl && (
                    <p className="mt-2 break-all text-[10px] text-ink-dim">{form.fileUrl}</p>
                  )}
                  {form.fileUrl && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm mt-2"
                      onClick={() => {
                        setForm({
                          ...form,
                          fileUrl: null,
                          fileName: null,
                          mime: null,
                          size: null
                        });
                        if (localPreview) {
                          URL.revokeObjectURL(localPreview);
                          setLocalPreview(null);
                        }
                      }}
                    >
                      Remove file
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={saving || (uploadPct !== null && uploadPct < 100)}
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
