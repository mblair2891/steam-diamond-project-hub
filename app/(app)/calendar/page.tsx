'use client';

import { useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { useProject } from '@/components/ProjectProvider';
import { useRole } from '@/hooks/useRole';
import { downloadBlob, formatDate, parseLocalDate, toISODate, uid } from '@/lib/dates';
import { exportCalendarCSV } from '@/lib/storage';
import type { MediaEvent, MediaEventType } from '@/lib/types';

export default function CalendarPage() {
  const { data, setData, getKeysDate } = useProject();
  const { canEdit } = useRole();
  const keys = parseLocalDate(getKeysDate());
  const [month, setMonth] = useState({ y: keys.getFullYear(), m: keys.getMonth() });
  const [modal, setModal] = useState<'new' | 'edit' | null>(null);
  const [form, setForm] = useState<MediaEvent>({
    id: '',
    title: '',
    date: toISODate(new Date()),
    type: 'post',
    channel: 'Instagram',
    notes: ''
  });

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

  const list = useMemo(
    () => [...data.mediaEvents].sort((a, b) => a.date.localeCompare(b.date)),
    [data.mediaEvents]
  );

  function openNew(date?: string) {
    setForm({
      id: '',
      title: '',
      date: date || toISODate(new Date()),
      type: 'post',
      channel: 'Instagram',
      notes: ''
    });
    setModal('new');
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const next = { ...form, id: form.id || uid('me'), title: form.title.trim() };
    setData((d) => {
      const idx = d.mediaEvents.findIndex((x) => x.id === next.id);
      const mediaEvents = [...d.mediaEvents];
      if (idx >= 0) mediaEvents[idx] = next;
      else mediaEvents.push(next);
      return { ...d, mediaEvents };
    });
    setModal(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Media Blitz Calendar</h2>
          <p className="ml-3 mt-1 text-sm text-ink-muted">Marketing content calendar</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button type="button" className="btn-primary btn-sm" onClick={() => openNew()}>
              + Event
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
                  <div key={e.id} className={`cal-event ${e.type}`} title={e.title}>
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
        <div className="flex items-center justify-between border-b border-surface-600 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide">All Events</h3>
          <span className="text-xs text-ink-dim">{list.length} items</span>
        </div>
        {list.map((e) => (
          <div key={e.id} className="data-row grid grid-cols-1 gap-2 sm:grid-cols-[100px_1fr_auto]">
            <div className="text-xs font-semibold text-amber-300">{formatDate(e.date)}</div>
            <div>
              <div className="text-sm font-medium">{e.title}</div>
              <div className="mt-0.5 text-[11px] capitalize text-ink-dim">
                {e.type} · {e.channel || '—'}
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setForm({ ...e });
                    setModal('edit');
                  }}
                >
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
        ))}
      </div>

      <Modal
        open={!!modal}
        title={modal === 'new' ? 'Add Media Event' : 'Edit Media Event'}
        onClose={() => setModal(null)}
      >
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label">Title</label>
            <input
              className="input"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as MediaEventType })}
              >
                <option value="post">post</option>
                <option value="video">video</option>
                <option value="announcement">announcement</option>
                <option value="event">event</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Channel</label>
            <input
              className="input"
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input min-h-[5rem]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Save
          </button>
        </form>
      </Modal>
    </div>
  );
}
